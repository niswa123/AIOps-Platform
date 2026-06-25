from fastapi import FastAPI, HTTPException, Header, Depends
from typing import List, Optional
import json
import datetime
from database import init_kafka, close_kafka, kafka_producer, ch_client, logger
from models import TelemetryEvent, setup_databases
import os

app = FastAPI(title="AIOps Observability Collector API", version="1.0.0")

KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "aiops.telemetry.events")

@app.on_event("startup")
async def startup_event():
    # Setup database schemas in PostgreSQL and ClickHouse
    setup_databases()
    # Init Kafka Producer
    await init_kafka()

@app.on_event("shutdown")
async def shutdown_event():
    await close_kafka()

@app.post("/v1/telemetry", status_code=202)
async def ingest_telemetry(
    event: TelemetryEvent,
    authorization: Optional[str] = Header(None)
):
    # Simple API Key check for MVP (can be extended to check Postgres hashes)
    if authorization and not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header scheme")

    # Serialize event
    event_dict = event.dict()
    # Handle metadata serialization for DB write
    metadata_json = json.dumps(event_dict.get("metadata") or {})
    event_dict["metadata"] = metadata_json
    event_dict["event_timestamp"] = datetime.datetime.utcnow().isoformat()
    # Map status to CH enum
    status_ch = "success" if event.status == "success" else "error"
    event_dict["status"] = status_ch
    event_dict["error_message"] = event.error or ""
    # Pop fields that are not in ClickHouse table or handled differently
    event_dict.pop("error", None)

    # 1. Pipeline Option A: Push to Kafka/Redpanda
    if kafka_producer:
        try:
            payload = json.dumps(event_dict).encode("utf-8")
            await kafka_producer.send_and_wait(KAFKA_TOPIC, payload)
            logger.debug(f"Pushed trace {event.trace_id} to Kafka.")
            return {"status": "accepted", "pipeline": "kafka"}
        except Exception as e:
            logger.warning(f"Failed to push to Kafka, falling back to direct ClickHouse insert: {e}")

    # 2. Pipeline Option B: Write directly to ClickHouse (Direct Sync Insert)
    if ch_client:
        try:
            # Clickhouse-connect insert expects a list of rows
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
            logger.debug(f"Inserted trace {event.trace_id} directly to ClickHouse.")
            return {"status": "accepted", "pipeline": "clickhouse_direct"}
        except Exception as e:
            logger.error(f"Failed direct ClickHouse write: {e}")
            raise HTTPException(status_code=500, detail="Database write failure")

    # If no backend is connected, log to console
    logger.info(f"Ingested local trace trace_id={event.trace_id} agent_id={event.agent_id} model={event.model}")
    return {"status": "accepted", "pipeline": "logger"}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "clickhouse_connected": ch_client is not None,
        "kafka_connected": kafka_producer is not None
    }
