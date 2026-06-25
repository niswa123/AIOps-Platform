"""
Kafka Consumer Group — reads telemetry events from Redpanda/Kafka topic
and performs batch inserts into ClickHouse every N events or T seconds.
"""
import asyncio
import json
import os
import time
import logging
from typing import List
from aiokafka import AIOKafkaConsumer
from database import ch_client, KAFKA_BOOTSTRAP_SERVERS

logger = logging.getLogger("aiops.consumer")

KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "aiops.telemetry.events")
CONSUMER_GROUP = os.getenv("KAFKA_CONSUMER_GROUP", "aiops-ch-writer")
BATCH_SIZE = int(os.getenv("CH_BATCH_SIZE", "1000"))
FLUSH_INTERVAL_SECS = float(os.getenv("CH_FLUSH_INTERVAL", "1.0"))

CH_COLUMNS = [
    'trace_id', 'span_id', 'parent_span_id', 'event_timestamp',
    'agent_id', 'session_id', 'model', 'provider', 'prompt_tokens',
    'completion_tokens', 'total_tokens', 'cost', 'latency_ms',
    'status', 'error_message', 'span_type', 'metadata'
]


def parse_event(raw: bytes) -> list:
    """Parse a raw JSON message into a ClickHouse row tuple."""
    data = json.loads(raw)
    return [
        data.get("trace_id", ""),
        data.get("span_id", ""),
        data.get("parent_span_id"),
        data.get("event_timestamp", ""),
        data.get("agent_id", ""),
        data.get("session_id", ""),
        data.get("model", ""),
        data.get("provider", ""),
        int(data.get("prompt_tokens", 0)),
        int(data.get("completion_tokens", 0)),
        int(data.get("total_tokens", 0)),
        float(data.get("cost", 0.0)),
        int(data.get("latency_ms", 0)),
        data.get("status", "success"),
        data.get("error_message", ""),
        data.get("span_type", "llm_call"),
        data.get("metadata", "{}"),
    ]


def flush_to_clickhouse(batch: List[list]):
    """Bulk insert a batch of rows into ClickHouse."""
    if not ch_client:
        logger.error("ClickHouse client not available. Dropping %d events.", len(batch))
        return

    try:
        ch_client.insert("telemetry_events", batch, column_names=CH_COLUMNS)
        logger.info("Flushed %d events to ClickHouse.", len(batch))
    except Exception as e:
        logger.error("ClickHouse batch insert failed: %s", e)
        # TODO: write failed batch to a dead-letter queue or local file


async def consume():
    """Main consumer loop with time-based and size-based flushing."""
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=CONSUMER_GROUP,
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        value_deserializer=lambda v: v,  # keep raw bytes
    )

    await consumer.start()
    logger.info(
        "Consumer started: topic=%s group=%s batch_size=%d flush_interval=%.1fs",
        KAFKA_TOPIC, CONSUMER_GROUP, BATCH_SIZE, FLUSH_INTERVAL_SECS,
    )

    batch: List[list] = []
    last_flush = time.time()

    try:
        async for msg in consumer:
            try:
                row = parse_event(msg.value)
                batch.append(row)
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning("Malformed message at offset %d: %s", msg.offset, e)
                continue

            now = time.time()
            if len(batch) >= BATCH_SIZE or (now - last_flush) >= FLUSH_INTERVAL_SECS:
                flush_to_clickhouse(batch)
                batch = []
                last_flush = now
    finally:
        # Flush any remaining events before shutdown
        if batch:
            flush_to_clickhouse(batch)
        await consumer.stop()
        logger.info("Consumer stopped.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(consume())
