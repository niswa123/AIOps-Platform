# GEMINI.md - System Architecture Spec

This document details the software architecture, database schemas, directory structure, and API contracts for the **AIOps Platform**.

---

## Directory Structure

```
AIManager/
├── collector/                 # Ingestion API (Go or FastAPI)
│   ├── cmd/                   # Entrypoints (Go version)
│   ├── internal/              # Core business logic (storage, validation, kafka)
│   └── main.py                # FastAPI alternative entrypoint
├── dashboard/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   ├── components/        # UI components (charts, tables, trace viewer)
│   │   ├── lib/               # Database / API clients
│   │   └── hooks/             # React hooks for metrics fetching
│   └── package.json
├── sdk/
│   ├── python/                # Python Auto-Instrumentation SDK
│   │   ├── aiops_sdk/
│   │   └── setup.py
│   └── nodejs/                # Node.js Auto-Instrumentation SDK
│       ├── src/
│       └── package.json
├── docker-compose.yml         # Dev environment (ClickHouse, Postgres, Redis, Kafka)
├── PRODUCT.md
├── DESIGN.md
└── GEMINI.md
```

---

## SDK Design & Instrumentation

The SDK intercepts calls to the official OpenAI and Anthropic clients using standard python monkey patching or JS proxies.

### Ingestion Payload Contract (`POST /v1/telemetry`)
```json
{
  "trace_id": "8f8b5f63-3d02-4b2a-89a1-8d262da157f1",
  "span_id": "0f6b4e12-4c01-4b1a-9fa8-7b243ea267e2",
  "parent_span_id": null,
  "agent_id": "customer-support-bot",
  "session_id": "sess-88231",
  "provider": "openai",
  "model": "gpt-4o",
  "prompt_tokens": 124,
  "completion_tokens": 58,
  "total_tokens": 182,
  "cost": 0.00182,
  "latency_ms": 450,
  "status": "success",
  "error": null,
  "span_type": "llm_call",
  "metadata": {
    "temperature": 0.7,
    "user_country": "US"
  }
}
```

---

## Storage Architecture & Schema Design

### ClickHouse (High-Throughput Analytics)
Used for all trace logs, cost calculation, and latency aggregation.

```sql
-- Database creation
CREATE DATABASE IF NOT EXISTS aiops_observability;

-- Telemetry events table
CREATE TABLE aiops_observability.telemetry_events (
    trace_id UUID,
    span_id UUID,
    parent_span_id Nullable(UUID),
    event_timestamp DateTime64(6, 'UTC') DEFAULT now(),
    organization_id LowCardinality(String),
    project_id LowCardinality(String),
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
ORDER BY (organization_id, project_id, agent_id, event_timestamp)
SETTINGS index_granularity = 8192;

-- Materialized View for hourly metrics aggregation
CREATE TABLE aiops_observability.hourly_metrics (
    hour DateTime,
    agent_id LowCardinality(String),
    model LowCardinality(String),
    total_calls UInt64,
    total_cost Decimal(12, 6),
    avg_latency SimpleAggregateFunction(avg, UInt32)
) ENGINE = SummingMergeTree()
PRIMARY KEY (hour, agent_id, model);
```

### PostgreSQL (Relational & Auth Meta)
Used for dashboard state, organizations, user authorization, and agent catalog.

```sql
-- Create schemas
CREATE SCHEMA IF NOT EXISTS aiops_core;

-- Organizations table
CREATE TABLE aiops_core.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE aiops_core.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES aiops_core.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Registered agents Catalog
CREATE TABLE aiops_core.agents (
    id VARCHAR(128) PRIMARY KEY,
    org_id UUID REFERENCES aiops_core.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(32) DEFAULT '1.0.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## Telemetry Process Stream (Collector API)

```
[Agent App with SDK]
        │
        │ (HTTP POST JSON payload)
        ▼
[Collector Service]
        │
        ├─► Authenticate API Key against PostgreSQL (cached in Redis)
        ▼
   [Kafka Ingest Queue] ──► (Topic: `aiops.telemetry.events`)
        │
        ▼
[Processor / Consumer] ──► (Bulk Write every 1s / 1000 items)
        │
        ▼
   [ClickHouse]
```
