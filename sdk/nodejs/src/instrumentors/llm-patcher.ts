/**
 * AIOps LLM Auto-Instrumentor for Node.js.
 *
 * Monkey-patches OpenAI and Anthropic JS client methods to emit telemetry.
 * Supports both sync-style and async methods.
 *
 * Usage:
 *   import { TelemetryClient } from "@aiops/sdk";
 *   import { LLMAutoInstrumentor } from "@aiops/sdk/instrumentors/llm-patcher";
 *
 *   const client = new TelemetryClient({ apiKey: "your-key" });
 *   const instrumentor = new LLMAutoInstrumentor(client);
 *   instrumentor.instrument();
 */

import { randomUUID } from "crypto";
import { TelemetryClient } from "../client";
import { calculateCost } from "../pricing";

export class LLMAutoInstrumentor {
  private client: TelemetryClient;

  constructor(client: TelemetryClient) {
    this.client = client;
  }

  /**
   * Instrument all available LLM providers.
   */
  instrument(): void {
    this.instrumentOpenAI();
    this.instrumentAnthropic();
  }

  /**
   * Patch OpenAI Node.js client: chat.completions.create
   */
  private instrumentOpenAI(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const openaiModule = require("openai");
      const OpenAI = openaiModule.default ?? openaiModule;

      if (!OpenAI?.Chat?.Completions?.prototype) return;
      const proto = OpenAI.Chat.Completions.prototype;

      if ((proto as Record<string, unknown>)._aiops_patched) return;

      const originalCreate = proto.create;
      const telemetryClient = this.client;

      proto.create = async function patchedCreate(
        this: unknown,
        ...args: unknown[]
      ): Promise<unknown> {
        const params = (args[0] ?? {}) as Record<string, unknown>;

        const traceId = (params.aiops_trace_id as string) ?? randomUUID();
        const spanId = randomUUID();
        const sessionId = (params.aiops_session_id as string) ?? "default-session";
        const agentId = (params.aiops_agent_id as string) ?? "openai-agent";

        // Remove custom keys before passing to OpenAI
        delete params.aiops_trace_id;
        delete params.aiops_session_id;
        delete params.aiops_agent_id;

        const model = (params.model as string) ?? "unknown-openai";
        const startTime = performance.now();

        try {
          const response = await originalCreate.apply(this, args);
          const latencyMs = Math.round(performance.now() - startTime);

          const resp = response as Record<string, unknown>;
          const usage = resp.usage as Record<string, number> | undefined;
          const promptTokens = usage?.prompt_tokens ?? 0;
          const completionTokens = usage?.completion_tokens ?? 0;
          const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
          const cost = calculateCost(model, promptTokens, completionTokens);

          telemetryClient.logEvent({
            trace_id: traceId,
            span_id: spanId,
            session_id: sessionId,
            agent_id: agentId,
            provider: "openai",
            model,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cost,
            latency_ms: latencyMs,
            status: "success",
            span_type: "llm_call",
            metadata: {
              temperature: params.temperature ?? 1.0,
              max_tokens: params.max_tokens,
            },
          });

          return response;
        } catch (err) {
          const latencyMs = Math.round(performance.now() - startTime);

          telemetryClient.logEvent({
            trace_id: traceId,
            span_id: spanId,
            session_id: sessionId,
            agent_id: agentId,
            provider: "openai",
            model,
            latency_ms: latencyMs,
            status: "error",
            error: String(err),
            span_type: "llm_call",
          });

          throw err;
        }
      };

      (proto as Record<string, unknown>)._aiops_patched = true;
    } catch {
      // openai package not installed
    }
  }

  /**
   * Patch Anthropic Node.js client: messages.create
   */
  private instrumentAnthropic(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const anthropicModule = require("@anthropic-ai/sdk");
      const Anthropic = anthropicModule.default ?? anthropicModule;

      if (!Anthropic?.Messages?.prototype) return;
      const proto = Anthropic.Messages.prototype;

      if ((proto as Record<string, unknown>)._aiops_patched) return;

      const originalCreate = proto.create;
      const telemetryClient = this.client;

      proto.create = async function patchedCreate(
        this: unknown,
        ...args: unknown[]
      ): Promise<unknown> {
        const params = (args[0] ?? {}) as Record<string, unknown>;

        const traceId = (params.aiops_trace_id as string) ?? randomUUID();
        const spanId = randomUUID();
        const sessionId = (params.aiops_session_id as string) ?? "default-session";
        const agentId = (params.aiops_agent_id as string) ?? "anthropic-agent";

        delete params.aiops_trace_id;
        delete params.aiops_session_id;
        delete params.aiops_agent_id;

        const model = (params.model as string) ?? "unknown-anthropic";
        const startTime = performance.now();

        try {
          const response = await originalCreate.apply(this, args);
          const latencyMs = Math.round(performance.now() - startTime);

          const resp = response as Record<string, unknown>;
          const usage = resp.usage as Record<string, number> | undefined;
          const promptTokens = usage?.input_tokens ?? 0;
          const completionTokens = usage?.output_tokens ?? 0;
          const totalTokens = promptTokens + completionTokens;
          const cost = calculateCost(model, promptTokens, completionTokens);

          telemetryClient.logEvent({
            trace_id: traceId,
            span_id: spanId,
            session_id: sessionId,
            agent_id: agentId,
            provider: "anthropic",
            model,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cost,
            latency_ms: latencyMs,
            status: "success",
            span_type: "llm_call",
            metadata: {
              temperature: params.temperature ?? 1.0,
              max_tokens: params.max_tokens,
            },
          });

          return response;
        } catch (err) {
          const latencyMs = Math.round(performance.now() - startTime);

          telemetryClient.logEvent({
            trace_id: traceId,
            span_id: spanId,
            session_id: sessionId,
            agent_id: agentId,
            provider: "anthropic",
            model,
            latency_ms: latencyMs,
            status: "error",
            error: String(err),
            span_type: "llm_call",
          });

          throw err;
        }
      };

      (proto as Record<string, unknown>)._aiops_patched = true;
    } catch {
      // @anthropic-ai/sdk not installed
    }
  }
}
