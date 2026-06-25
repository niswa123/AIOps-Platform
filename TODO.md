# TODO.md - AIOps Platform Full Product Roadmap

This checklist outlines all features required to transition AIOps Platform from an MVP to an Enterprise-grade observability suite.

---

## 1. SDKs & Auto-Instrumentation
- [ ] **SDK Core Enhancements**
  - [ ] Add asynchronous batching & memory buffering for telemetry payloads (prevents blocking target agent execution).
  - [ ] Implement exponential backoff & offline fallback cache for SDK payloads.
- [ ] **Python Integrations**
  - [ ] Auto-instrumentation hooks for **LangChain** (Callback Handler).
  - [ ] Auto-instrumentation hooks for **LlamaIndex** (Instrumentor).
  - [ ] Auto-instrumentation hooks for **CrewAI** & **AutoGen** frameworks.
  - [ ] Native support for local model providers (Ollama, vLLM, HuggingFace Transformers).
- [ ] **Node.js / TypeScript Integrations**
  - [ ] Auto-instrumentation hooks for Vercel AI SDK.
  - [ ] Auto-instrumentation hooks for LangChain.js.

---

## 2. Ingestion Pipeline & Analytics Core (Collector & ClickHouse)
- [x] **Pipeline Scalability**
  - [x] Implement Kafka event processor consumer group in Go/Python (batch insert to ClickHouse).
  - [x] Configure ClickHouse **Buffer engine** or asynchronous inserts to prevent writing too frequently.
  - [x] Implement real-time Redis-based rate limiting per project/API Key.
- [x] **FinOps Engine**
  - [x] Build a model pricing database parser that automatically pulls updated costs for OpenAI, Anthropic, and Cohere.
  - [x] Build an alert engine for anomaly cost detection (e.g., an agent loop generating $100 in 10 minutes).
- [x] **Privacy & Governance (Security)**
  - [x] Implement a **PII & Secret Scrubber** middleware (scrub API keys, emails, credit cards from prompt logs).
  - [x] Add prompt-injection detection alerts in the ingestion pipeline.

---

## 3. Web Dashboard (Next.js)
- [ ] **Observability & Distributed Tracing**
  - [ ] **Trace Waterfall Chart:** Gantt-style execution timelines showing the nesting of Agent -> Tool -> LLM -> Response.
  - [ ] Interactive workflow graph (dag-style visualization of agent interactions and state machines).
- [ ] **FinOps Dashboard**
  - [ ] Cost breakdown by Organization, Project, Agent, and User Session.
  - [ ] Recommendations engine (e.g., Suggesting migration from `gpt-4o` to `gpt-4o-mini` based on prompt token sizes).
- [ ] **Prompt Analytics & Versioning**
  - [ ] Version control dashboard for prompts (comparing latency, costs, and success rates between prompt versions).
  - [ ] A Playground UI to test prompts on past trace logs.
- [ ] **Error Monitoring**
  - [ ] Sentry-like error grouping for agent tool failures, model rate limits (429), and connection timeouts.

---

## 4. Platform & Enterprise Features
- [ ] Multi-tenant workspace management (Organizations -> Projects).
- [ ] Role-Based Access Control (RBAC) (Owner, Admin, Viewer).
- [ ] SSO & OAuth integration (GitHub, Google, Okta).
- [ ] Self-hosted / Helm chart deployment guides for private Kubernetes clusters.


## RESULT
1, 2,3