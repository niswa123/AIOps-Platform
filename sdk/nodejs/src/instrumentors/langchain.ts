/**
 * AIOps LangChain.js Callback Handler.
 *
 * Implements LangChain.js BaseCallbackHandler to capture:
 * - LLM start/end/error events
 * - Tool/chain start/end/error events
 *
 * Usage:
 *   import { TelemetryClient } from "@aiops/sdk";
 *   import { AIOpsLangChainHandler } from "@aiops/sdk/instrumentors/langchain";
 *
 *   const client = new TelemetryClient({ apiKey: "your-key" });
 *   const handler = new AIOpsLangChainHandler(client, { agentId: "my-agent" });
 *
 *   // Pass as callback to LangChain calls
 *   const result = await llm.invoke("Hello", { callbacks: [handler] });
 */

import { randomUUID } from "crypto";
import { TelemetryClient } from "../client";
import { calculateCost } from "../pricing";

interface RunSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  startTime: number;
  model?: string;
  toolName?: string;
}

export class AIOpsLangChainHandler {
  name = "AIOpsLangChainHandler";
  private client: TelemetryClient;
  private agentId: string;
  private sessionId: string;
  private spans: Map<string, RunSpan> = new Map();

  constructor(
    client: TelemetryClient,
    options?: { agentId?: string; sessionId?: string },
  ) {
    this.client = client;
    this.agentId = options?.agentId ?? "langchain-agent";
    this.sessionId = options?.sessionId ?? "default-session";
  }

  // ─── LLM Events ──────────────────────────────────────────────

  handleLLMStart(
    llm: Record<string, unknown>,
    prompts: string[],
    runId: string,
    parentRunId?: string,
  ): void {
    const traceId = parentRunId ?? runId;
    this.spans.set(runId, {
      traceId,
      spanId: runId,
      parentSpanId: parentRunId ?? null,
      startTime: performance.now(),
      model: (llm.id as string[])?.slice(-1)[0] ?? "unknown",
    });
  }

  handleLLMEnd(
    output: Record<string, unknown>,
    runId: string,
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);

    const latencyMs = Math.round(performance.now() - span.startTime);

    // Extract token usage from LLM output
    const llmOutput = output.llmOutput as Record<string, unknown> | undefined;
    const tokenUsage = llmOutput?.tokenUsage as Record<string, number> | undefined;
    const promptTokens = tokenUsage?.promptTokens ?? 0;
    const completionTokens = tokenUsage?.completionTokens ?? 0;
    const totalTokens = tokenUsage?.totalTokens ?? promptTokens + completionTokens;

    const model = span.model ?? "unknown";
    const cost = calculateCost(model, promptTokens, completionTokens);

    this.client.logEvent({
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      session_id: this.sessionId,
      agent_id: this.agentId,
      provider: "langchain-llm",
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost,
      latency_ms: latencyMs,
      status: "success",
      span_type: "llm_call",
    });
  }

  handleLLMError(
    err: Error,
    runId: string,
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);

    const latencyMs = Math.round(performance.now() - span.startTime);

    this.client.logEvent({
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      session_id: this.sessionId,
      agent_id: this.agentId,
      provider: "langchain-llm",
      model: span.model ?? "unknown",
      latency_ms: latencyMs,
      status: "error",
      error: err.message,
      span_type: "llm_call",
    });
  }

  // ─── Tool Events ──────────────────────────────────────────────

  handleToolStart(
    tool: Record<string, unknown>,
    input: string,
    runId: string,
    parentRunId?: string,
  ): void {
    const traceId = parentRunId ?? runId;
    this.spans.set(runId, {
      traceId,
      spanId: runId,
      parentSpanId: parentRunId ?? null,
      startTime: performance.now(),
      toolName: (tool.name as string) ?? "unknown_tool",
    });
  }

  handleToolEnd(
    output: string,
    runId: string,
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);

    const latencyMs = Math.round(performance.now() - span.startTime);

    this.client.logEvent({
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      session_id: this.sessionId,
      agent_id: this.agentId,
      provider: "langchain-tool",
      model: span.toolName ?? "unknown_tool",
      latency_ms: latencyMs,
      status: "success",
      span_type: "tool_call",
      metadata: {
        output_preview: output.slice(0, 200),
      },
    });
  }

  handleToolError(
    err: Error,
    runId: string,
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);

    const latencyMs = Math.round(performance.now() - span.startTime);

    this.client.logEvent({
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      session_id: this.sessionId,
      agent_id: this.agentId,
      provider: "langchain-tool",
      model: span.toolName ?? "unknown_tool",
      latency_ms: latencyMs,
      status: "error",
      error: err.message,
      span_type: "tool_call",
    });
  }

  // ─── Chain Events ─────────────────────────────────────────────

  handleChainStart(
    chain: Record<string, unknown>,
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
  ): void {
    const traceId = parentRunId ?? runId;
    this.spans.set(runId, {
      traceId,
      spanId: runId,
      parentSpanId: parentRunId ?? null,
      startTime: performance.now(),
      toolName: (chain.id as string[])?.slice(-1)[0] ?? "chain",
    });
  }

  handleChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);

    const latencyMs = Math.round(performance.now() - span.startTime);

    this.client.logEvent({
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      session_id: this.sessionId,
      agent_id: this.agentId,
      provider: "langchain-chain",
      model: span.toolName ?? "chain",
      latency_ms: latencyMs,
      status: "success",
      span_type: "agent_run",
    });
  }

  handleChainError(
    err: Error,
    runId: string,
  ): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);

    const latencyMs = Math.round(performance.now() - span.startTime);

    this.client.logEvent({
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId,
      session_id: this.sessionId,
      agent_id: this.agentId,
      provider: "langchain-chain",
      model: span.toolName ?? "chain",
      latency_ms: latencyMs,
      status: "error",
      error: err.message,
      span_type: "agent_run",
    });
  }
}
