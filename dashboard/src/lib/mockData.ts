export interface TelemetrySpan {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  span_type: "agent_run" | "tool_call" | "llm_call";
  start_offset_ms: number; // relative to trace start
  latency_ms: number;
  status: "success" | "error";
  error_message?: string;
  provider?: string;
  model?: string;
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  metadata: Record<string, any>;
}

export interface Trace {
  trace_id: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  project_id: string;
  timestamp: string;
  status: "success" | "error";
  latency_ms: number;
  cost: number;
  spans: TelemetrySpan[];
}

export const MOCK_TRACES: Trace[] = [
  {
    trace_id: "8f8b5f63-3d02-4b2a-89a1-8d262da157f1",
    session_id: "sess-88231",
    agent_id: "customer-support-bot",
    agent_name: "Customer Support Agent",
    project_id: "crm-integration",
    timestamp: "2026-06-25T23:45:10Z",
    status: "success",
    latency_ms: 1250,
    cost: 0.00512,
    spans: [
      {
        span_id: "span-root",
        parent_span_id: null,
        name: "support_agent_run",
        span_type: "agent_run",
        start_offset_ms: 0,
        latency_ms: 1250,
        status: "success",
        metadata: {
          task: "Resolve customer invoice dispute for Order #90812",
          resolved_status: "disputed_refund_issued"
        }
      },
      {
        span_id: "span-db-tool",
        parent_span_id: "span-root",
        name: "tool_fetch_invoice",
        span_type: "tool_call",
        start_offset_ms: 50,
        latency_ms: 180,
        status: "success",
        metadata: {
          query: "SELECT * FROM invoices WHERE id = '90812'",
          rows_returned: 1
        }
      },
      {
        span_id: "span-llm-analyze",
        parent_span_id: "span-root",
        name: "llm_analyze_dispute",
        span_type: "llm_call",
        start_offset_ms: 250,
        latency_ms: 450,
        status: "success",
        provider: "openai",
        model: "gpt-4o",
        cost: 0.00182,
        prompt_tokens: 124,
        completion_tokens: 58,
        total_tokens: 182,
        metadata: {
          temperature: 0.2,
          system_prompt: "You are a financial auditor assistant..."
        }
      },
      {
        span_id: "span-chargeback-tool",
        parent_span_id: "span-root",
        name: "tool_stripe_refund",
        span_type: "tool_call",
        start_offset_ms: 720,
        latency_ms: 320,
        status: "success",
        metadata: {
          charge_id: "ch_1Nst8291X0",
          amount_cents: 4500
        }
      },
      {
        span_id: "span-llm-reply",
        parent_span_id: "span-root",
        name: "llm_generate_email",
        span_type: "llm_call",
        start_offset_ms: 1060,
        latency_ms: 180,
        status: "success",
        provider: "openai",
        model: "gpt-4o-mini",
        cost: 0.00030,
        prompt_tokens: 300,
        completion_tokens: 80,
        total_tokens: 380,
        metadata: {
          temperature: 0.7
        }
      }
    ]
  },
  {
    trace_id: "f3c2c1a0-629a-4712-ba29-2cf2b17a1093",
    session_id: "sess-99081",
    agent_id: "market-researcher",
    agent_name: "Market Analyst Agent",
    project_id: "competitor-intelligence",
    timestamp: "2026-06-25T23:40:02Z",
    status: "error",
    latency_ms: 3420,
    cost: 0.04500,
    spans: [
      {
        span_id: "span-market-root",
        parent_span_id: null,
        name: "market_research_run",
        span_type: "agent_run",
        start_offset_ms: 0,
        latency_ms: 3420,
        status: "error",
        error_message: "ToolFailure: search_web exceeded connection timeout limit (3000ms)",
        metadata: {
          query: "Analyze current market trends for H1 2026 GPU pricing"
        }
      },
      {
        span_id: "span-web-search-failed",
        parent_span_id: "span-market-root",
        name: "tool_search_web",
        span_type: "tool_call",
        start_offset_ms: 200,
        latency_ms: 3010,
        status: "error",
        error_message: "HTTP Connection Timeout",
        metadata: {
          engine: "google_serp",
          query: "H1 2026 NVIDIA H100 pricing trends"
        }
      },
      {
        span_id: "span-llm-fallback",
        parent_span_id: "span-market-root",
        name: "llm_draft_fallback_report",
        span_type: "llm_call",
        start_offset_ms: 3220,
        latency_ms: 190,
        status: "success",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        cost: 0.00310,
        prompt_tokens: 520,
        completion_tokens: 95,
        total_tokens: 615,
        metadata: {
          reasoning_steps: 12
        }
      }
    ]
  },
  {
    trace_id: "1c28d8b9-440a-42ee-8ba2-0c9f13d803a1",
    session_id: "sess-88231",
    agent_id: "customer-support-bot",
    agent_name: "Customer Support Agent",
    project_id: "crm-integration",
    timestamp: "2026-06-25T23:32:15Z",
    status: "success",
    latency_ms: 680,
    cost: 0.00220,
    spans: [
      {
        span_id: "span-root-2",
        parent_span_id: null,
        name: "quick_q_and_a",
        span_type: "agent_run",
        start_offset_ms: 0,
        latency_ms: 680,
        status: "success",
        metadata: {
          user_question: "When is my package arriving?"
        }
      },
      {
        span_id: "span-llm-check",
        parent_span_id: "span-root-2",
        name: "llm_intent_classification",
        span_type: "llm_call",
        start_offset_ms: 30,
        latency_ms: 220,
        status: "success",
        provider: "openai",
        model: "gpt-4o-mini",
        cost: 0.00015,
        prompt_tokens: 150,
        completion_tokens: 15,
        total_tokens: 165,
        metadata: {}
      },
      {
        span_id: "span-fetch-tracking",
        parent_span_id: "span-root-2",
        name: "tool_fedex_tracking",
        span_type: "tool_call",
        start_offset_ms: 270,
        latency_ms: 180,
        status: "success",
        metadata: {
          tracking_id: "123456789012"
        }
      },
      {
        span_id: "span-llm-final",
        parent_span_id: "span-root-2",
        name: "llm_generate_response",
        span_type: "llm_call",
        start_offset_ms: 470,
        latency_ms: 200,
        status: "success",
        provider: "openai",
        model: "gpt-4o",
        cost: 0.00190,
        prompt_tokens: 280,
        completion_tokens: 45,
        total_tokens: 325,
        metadata: {}
      }
    ]
  }
];

export interface CostMetric {
  date: string;
  openai: number;
  anthropic: number;
  cohere: number;
  total: number;
}

export const MOCK_COST_TREND: CostMetric[] = [
  { date: "06-19", openai: 45.2, anthropic: 12.8, cohere: 2.1, total: 60.1 },
  { date: "06-20", openai: 52.4, anthropic: 15.6, cohere: 2.3, total: 70.3 },
  { date: "06-21", openai: 49.8, anthropic: 14.2, cohere: 1.9, total: 65.9 },
  { date: "06-22", openai: 68.1, anthropic: 22.4, cohere: 3.4, total: 93.9 },
  { date: "06-23", openai: 85.3, anthropic: 35.8, cohere: 4.2, total: 125.3 },
  { date: "06-24", openai: 112.5, anthropic: 48.2, cohere: 5.5, total: 166.2 },
  { date: "06-25", openai: 124.8, anthropic: 54.1, cohere: 6.2, total: 185.1 }
];

export const MOCK_FINOPS_RECOMMENDATIONS = [
  {
    id: "rec-1",
    agent_id: "customer-support-bot",
    agent_name: "Customer Support Agent",
    impact: "High Savings",
    description: "Migrate 80% of intent classifications from gpt-4o to gpt-4o-mini",
    rationale: "Prompt token sizes average 150 tokens. Classification accuracy remains 98.4% on mini model.",
    potential_savings: 142.50, // per week
  },
  {
    id: "rec-2",
    agent_id: "market-researcher",
    agent_name: "Market Analyst Agent",
    impact: "Moderate Savings",
    description: "Implement Redis caching for duplicate Google Serp Tool queries",
    rationale: "Detected 41% duplicate queries on H1 2026 pricing. Caching reduces LLM evaluations and tool latency.",
    potential_savings: 58.20, // per week
  },
  {
    id: "rec-3",
    agent_id: "all",
    agent_name: "Global Platform",
    impact: "Low Savings",
    description: "Trim system prompt wrappers by optimizing prompt instructions",
    rationale: "Removing redundant markdown formatting guidelines in system prompt saves 45 tokens per call, reducing overall costs by 3%.",
    potential_savings: 22.10, // per week
  }
];

export interface PromptVersion {
  version: string;
  timestamp: string;
  latency_ms: number;
  cost: number;
  success_rate: number; // percentage
  status: "active" | "deprecated";
  prompt_text: string;
}

export interface PromptItem {
  id: string;
  name: string;
  active_model: string;
  versions: PromptVersion[];
}

export const MOCK_PROMPTS: PromptItem[] = [
  {
    id: "prompt-dispute-eval",
    name: "support_agent_dispute_evaluation",
    active_model: "gpt-4o",
    versions: [
      {
        version: "v3 (Active)",
        timestamp: "2026-06-24T18:00:00Z",
        latency_ms: 450,
        cost: 0.00182,
        success_rate: 98.6,
        status: "active",
        prompt_text: "You are a dispute evaluation specialist. Analyze order details {{order_details}}, checking invoice constraints. Resolve issue with minimal user frictions."
      },
      {
        version: "v2",
        timestamp: "2026-06-20T12:00:00Z",
        latency_ms: 620,
        cost: 0.00240,
        success_rate: 94.2,
        status: "deprecated",
        prompt_text: "You are a customer agent. Read order disputes {{order_details}} and check if they deserve refund. Output JSON with status and refund_cents."
      },
      {
        version: "v1",
        timestamp: "2026-06-15T09:30:00Z",
        latency_ms: 810,
        cost: 0.00350,
        success_rate: 89.1,
        status: "deprecated",
        prompt_text: "Evaluate customer order dispute {{order_details}}. Decide refund yes/no. Give deep reasoning explanation in 3 paragraphs."
      }
    ]
  },
  {
    id: "prompt-intent-classify",
    name: "support_agent_intent_classifier",
    active_model: "gpt-4o-mini",
    versions: [
      {
        version: "v2 (Active)",
        timestamp: "2026-06-22T10:00:00Z",
        latency_ms: 120,
        cost: 0.00012,
        success_rate: 99.1,
        status: "active",
        prompt_text: "Classify incoming user query {{user_query}} into: refund, shipping, generic_qa. Output ONLY one of the words."
      },
      {
        version: "v1",
        timestamp: "2026-06-18T14:20:00Z",
        latency_ms: 210,
        cost: 0.00035,
        success_rate: 96.8,
        status: "deprecated",
        prompt_text: "Review customer message {{user_query}} and classify intent. Categories: refund, track_package, help_q. Respond with classification JSON."
      }
    ]
  }
];

export interface ErrorGroup {
  error_id: string;
  message: string;
  exception_type: string;
  agent_id: string;
  agent_name: string;
  occurrences: number;
  affected_sessions: number;
  last_seen: string;
  stack_trace: string;
  prompt_input: string;
}

export const MOCK_ERRORS: ErrorGroup[] = [
  {
    error_id: "err-429-anthropic",
    message: "Anthropic Rate Limit Exceeded: 429 requests limit hit.",
    exception_type: "RateLimitError",
    agent_id: "market-researcher",
    agent_name: "Market Analyst Agent",
    occurrences: 142,
    affected_sessions: 24,
    last_seen: "2026-06-25T23:51:10Z",
    stack_trace: `Traceback (most recent call last):
  File "aiops_sdk/instrumentation/llm_patcher.py", line 42, in wrapper
    response = original_func(*args, **kwargs)
  File "anthropic/_client.py", line 820, in create
    return self._post("/messages", body, options)
anthropic.RateLimitError: Error code: 429 - Rate limit hit for Sonnet 3.5.`,
    prompt_input: "Analyze current market trends for H1 2026 GPU pricing... [System Instructions]"
  },
  {
    error_id: "err-timeout-search",
    message: "ToolFailure: search_web exceeded connection timeout limit (3000ms)",
    exception_type: "TimeoutError",
    agent_id: "market-researcher",
    agent_name: "Market Analyst Agent",
    occurrences: 84,
    affected_sessions: 19,
    last_seen: "2026-06-25T23:40:02Z",
    stack_trace: `Traceback (most recent call last):
  File "agent/tools/web_search.py", line 18, in run
    res = requests.get(SERP_URL, params=params, timeout=3.0)
requests.exceptions.Timeout: Connection timed out after 3.0 seconds.`,
    prompt_input: "H1 2026 NVIDIA H100 pricing trends"
  },
  {
    error_id: "err-db-conn",
    message: "Database connection lost: postgresql://postgres@localhost:5432/aiops",
    exception_type: "OperationalError",
    agent_id: "customer-support-bot",
    agent_name: "Customer Support Agent",
    occurrences: 12,
    affected_sessions: 3,
    last_seen: "2026-06-25T22:15:30Z",
    stack_trace: `sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) connection to server at "localhost" (::1), port 5432 failed: Connection refused
Is the server running on that host and accepting TCP/IP connections?`,
    prompt_input: "SELECT * FROM invoices WHERE id = '90812'"
  }
];

// ──────────── Workspace & Enterprise Mock Data ────────────

export interface OrgMember {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "viewer";
  avatar_initial: string;
  joined: string;
  last_active: string;
}

export interface OrgProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  agent_count: number;
  created_at: string;
}

export interface OrgApiKey {
  id: string;
  name: string;
  key_prefix: string;
  project: string;
  created_at: string;
  last_used: string;
  is_active: boolean;
}

export const MOCK_ORG = {
  id: "org-niswa123",
  name: "Niswa AI Labs",
  slug: "niswa123",
  plan: "Pro",
  created_at: "2026-05-10T08:00:00Z",
};

export const MOCK_MEMBERS: OrgMember[] = [
  {
    id: "user-1",
    email: "ape.ces@niswa123.ai",
    name: "Ape Ces",
    role: "owner",
    avatar_initial: "AC",
    joined: "2026-05-10",
    last_active: "2026-06-25",
  },
  {
    id: "user-2",
    email: "dev@niswa123.ai",
    name: "Dev Ops",
    role: "admin",
    avatar_initial: "DO",
    joined: "2026-05-15",
    last_active: "2026-06-24",
  },
  {
    id: "user-3",
    email: "viewer@external.com",
    name: "External Auditor",
    role: "viewer",
    avatar_initial: "EA",
    joined: "2026-06-01",
    last_active: "2026-06-20",
  },
];

export const MOCK_PROJECTS: OrgProject[] = [
  {
    id: "proj-crm",
    name: "CRM Integration",
    slug: "crm-integration",
    description: "Customer support bots and invoice dispute resolution agents.",
    agent_count: 2,
    created_at: "2026-05-12",
  },
  {
    id: "proj-intel",
    name: "Competitor Intelligence",
    slug: "competitor-intelligence",
    description: "Market research and GPU pricing analysis agents.",
    agent_count: 1,
    created_at: "2026-05-20",
  },
  {
    id: "proj-internal",
    name: "Internal Tools",
    slug: "internal-tools",
    description: "Code review bots and documentation generators.",
    agent_count: 3,
    created_at: "2026-06-05",
  },
];

export const MOCK_API_KEYS: OrgApiKey[] = [
  {
    id: "key-1",
    name: "Production SDK Key",
    key_prefix: "aio_xK9m...",
    project: "CRM Integration",
    created_at: "2026-05-12",
    last_used: "2026-06-25 23:45",
    is_active: true,
  },
  {
    id: "key-2",
    name: "Staging Key",
    key_prefix: "aio_bT2n...",
    project: "Competitor Intelligence",
    created_at: "2026-05-20",
    last_used: "2026-06-25 23:40",
    is_active: true,
  },
  {
    id: "key-3",
    name: "Deprecated CI Key",
    key_prefix: "aio_oL7q...",
    project: "Internal Tools",
    created_at: "2026-06-01",
    last_used: "2026-06-18 10:22",
    is_active: false,
  },
];
