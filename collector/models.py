from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from database import Base, ch_client, logger
import datetime
import uuid

# Pydantic models for request validation
class TelemetryEvent(BaseModel):
    trace_id: str = Field(..., description="Unique ID for the full trace chain")
    span_id: str = Field(..., description="Unique ID for this specific trace span")
    parent_span_id: Optional[str] = Field(None, description="Parent span ID if nested")
    agent_id: str = Field(..., description="Identifier of the executing agent")
    session_id: str = Field(..., description="Session identifier for grouping conversations")
    provider: str = Field(..., description="LLM provider (e.g. openai, anthropic)")
    model: str = Field(..., description="LLM model (e.g. gpt-4o, claude-3-5-sonnet)")
    prompt_tokens: int = Field(0, ge=0)
    completion_tokens: int = Field(0, ge=0)
    total_tokens: int = Field(0, ge=0)
    cost: float = Field(0.0, ge=0.0)
    latency_ms: int = Field(0, ge=0)
    status: str = Field("success", description="Run status: success, error")
    error: Optional[str] = None
    span_type: str = Field("llm_call", description="Span type: llm_call, tool_call, agent_run")
    metadata: Optional[Dict[str, Any]] = None

# SQLAlchemy Models for Postgres Relational data
class AgentModel(Base):
    __tablename__ = 'agents'
    __table_args__ = {'schema': 'public'}

    id = Column(String(128), primary_key=True)
    name = Column(String(255), nullable=False)
    version = Column(String(32), default='1.0.0')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

def setup_databases():
    # 1. Setup PostgreSQL Tables
    try:
        from database import engine
        Base.metadata.create_all(bind=engine)
        logger.info("PostgreSQL schemas created/validated successfully.")
    except Exception as e:
        logger.warning(f"Could not build PostgreSQL database schema: {e}")

    # 2. Setup ClickHouse Tables
    if ch_client:
        try:
            ch_client.command("""
            CREATE TABLE IF NOT EXISTS telemetry_events (
                trace_id String,
                span_id String,
                parent_span_id Nullable(String),
                event_timestamp DateTime64(6, 'UTC'),
                agent_id LowCardinality(String),
                session_id String,
                model LowCardinality(String),
                provider LowCardinality(String),
                prompt_tokens UInt32,
                completion_tokens UInt32,
                total_tokens UInt32,
                cost Decimal(10, 6),
                latency_ms UInt32,
                status Enum8('success'=1, 'error'=2),
                error_message String,
                span_type Enum8('llm_call'=1, 'tool_call'=2, 'agent_run'=3),
                metadata String
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(event_timestamp)
            ORDER BY (agent_id, event_timestamp);
            """)
            logger.info("ClickHouse database schema created/validated successfully.")
        except Exception as e:
            logger.error(f"Failed to setup ClickHouse table: {e}")
