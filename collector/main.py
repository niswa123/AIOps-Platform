from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
import datetime
from database import init_kafka, close_kafka, kafka_producer, ch_client, redis_client, logger
from models import TelemetryEvent, setup_databases
from middleware.rate_limiter import RateLimitMiddleware
from middleware.pii_scrubber import scrub_telemetry_event
from middleware.injection_detector import scan_telemetry_event
from finops.pricing_engine import calculate_cost, record_cost_and_check_anomaly, get_pricing_table
from auth.oauth_router import router as oauth_router
from auth.workspace_router import router as workspace_router
from auth.rbac import resolve_api_key, AuthContext
import os

app = FastAPI(
    title="AIOps Observability Collector API",
    version="2.0.0",
    description="Telemetry ingestion, multi-tenant workspace management, and SSO authentication.",
)

# CORS for dashboard frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register auth & workspace routers
app.include_router(oauth_router)
app.include_router(workspace_router)

# Wire up rate limiting middleware
app.add_middleware(RateLimitMiddleware, window_secs=60, max_requests=600)

KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "aiops.telemetry.events")


@app.on_event("startup")
async def startup_event():
    setup_databases()
    # Create multi-tenant tables (organizations, users, memberships, api_keys, projects)
    try:
        from auth.tenant_models import Organization, Project, User, Membership, ApiKey
        from database import engine
        from auth.tenant_models import Base as TenantBase
        # Use the same Base from database.py since tenant_models imports it
        from database import Base
        Base.metadata.create_all(bind=engine)
        logger.info("Multi-tenant database schemas created/validated.")
    except Exception as e:
        logger.warning(f"Could not create tenant schemas: {e}")
    await init_kafka()


@app.on_event("shutdown")
async def shutdown_event():
    await close_kafka()


@app.post("/v1/telemetry", status_code=202)
async def ingest_telemetry(
    event: TelemetryEvent,
    auth: AuthContext = Depends(resolve_api_key)
):

    # Serialize event
    event_dict = event.dict()

    # --- FinOps: recalculate cost using the pricing engine ---
    calculated_cost = calculate_cost(event.model, event.prompt_tokens, event.completion_tokens)
    if calculated_cost > 0:
        event_dict["cost"] = calculated_cost

    # Handle metadata serialization
    metadata_json = json.dumps(event_dict.get("metadata") or {})
    event_dict["metadata"] = metadata_json
    event_dict["event_timestamp"] = datetime.datetime.utcnow().isoformat()
    status_ch = "success" if event.status == "success" else "error"
    event_dict["status"] = status_ch
    event_dict["error_message"] = event.error or ""
    event_dict.pop("error", None)

    # --- Privacy: scrub PII & secrets from event ---
    event_dict = scrub_telemetry_event(event_dict)

    # --- Security: scan for prompt injection patterns ---
    injection_alert = scan_telemetry_event(event_dict)

    # --- FinOps: anomaly cost detection ---
    cost_alert = record_cost_and_check_anomaly(
        agent_id=event.agent_id,
        cost=event_dict.get("cost", 0.0),
    )

    # Build response with optional alerts
    alerts = []
    if injection_alert:
        alerts.append(injection_alert)
    if cost_alert:
        alerts.append(cost_alert)

    # 1. Pipeline A: Push to Kafka/Redpanda
    if kafka_producer:
        try:
            payload = json.dumps(event_dict, default=str).encode("utf-8")
            await kafka_producer.send_and_wait(KAFKA_TOPIC, payload)
            logger.debug("Pushed trace %s to Kafka.", event.trace_id)
            return {"status": "accepted", "pipeline": "kafka", "alerts": alerts}
        except Exception as e:
            logger.warning("Failed to push to Kafka, falling back to direct ClickHouse insert: %s", e)

    # 2. Pipeline B: Direct ClickHouse insert
    if ch_client:
        try:
            data_row = [
                event_dict["trace_id"],
                event_dict["span_id"],
                event_dict["parent_span_id"],
                datetime.datetime.utcnow(),
                event_dict["agent_id"],
                event_dict["session_id"],
                event_dict["model"],
                event_dict["provider"],
                event_dict["prompt_tokens"],
                event_dict["completion_tokens"],
                event_dict["total_tokens"],
                event_dict["cost"],
                event_dict["latency_ms"],
                event_dict["status"],
                event_dict["error_message"],
                event_dict["span_type"],
                event_dict["metadata"]
            ]
            ch_client.insert(
                'telemetry_events',
                [data_row],
                column_names=[
                    'trace_id', 'span_id', 'parent_span_id', 'event_timestamp',
                    'agent_id', 'session_id', 'model', 'provider', 'prompt_tokens',
                    'completion_tokens', 'total_tokens', 'cost', 'latency_ms',
                    'status', 'error_message', 'span_type', 'metadata'
                ]
            )
            logger.debug("Inserted trace %s directly to ClickHouse.", event.trace_id)
            return {"status": "accepted", "pipeline": "clickhouse_direct", "alerts": alerts}
        except Exception as e:
            logger.error("Failed direct ClickHouse write: %s", e)
            raise HTTPException(status_code=500, detail="Database write failure")

    # 3. Fallback: log to console
    logger.info("Ingested local trace trace_id=%s agent_id=%s model=%s", event.trace_id, event.agent_id, event.model)
    return {"status": "accepted", "pipeline": "logger", "alerts": alerts}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "clickhouse_connected": ch_client is not None,
        "kafka_connected": kafka_producer is not None,
        "redis_connected": redis_client is not None,
    }


@app.get("/v1/pricing")
def pricing_table():
    """Return the full model pricing table for the dashboard FinOps view."""
    return get_pricing_table()
