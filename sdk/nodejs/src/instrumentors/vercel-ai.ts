/**
 * AIOps Vercel AI SDK Instrumentor.
 *
 * Wraps Vercel AI SDK's `generateText` and `streamText` functions
 * to emit telemetry spans for every AI call.
 *
 * Usage:
 *   import { TelemetryClient } from "@aiops/sdk";
 *   import { VercelAIInstrumentor } from "@aiops/sdk/instrumentors/vercel-ai";
 *
 *   const client = new TelemetryClient({ apiKey: "your-key" });
 *   const instrumentor = new VercelAIInstrumentor(client);
 *   instrumentor.instrument();
 */

import { randomUUID } from "crypto";
import { TelemetryClient } from "../client";
import { calculateCost } from "../pricing";

export class VercelAIInstrumentor {
  private client: TelemetryClient;
  private agentId: string;
  private sessionId: string;

  constructor(
    client: TelemetryClient,
    options?: { agentId?: string; sessionId?: string },
  ) {
    this.client = client;
    this.agentId = options?.agentId ?? "vercel-ai-agent";
    this.sessionId = options?.sessionId ?? "default-session";
  }

  /**
   * Patch Vercel AI SDK functions.
   */
  instrument(): void {
    this.patchGenerateText();
    this.patchStreamText();
  }

  private patchGenerateText(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const aiModule = require("ai");
      if (!aiModule.generateText || (aiModule as Record<string, unknown>)._aiops_generateText_patched) return;

      const originalGenerateText = aiModule.generateText;
      const telemetryClient = this.client;
      const agentId = this.agentId;
      const sessionId = this.sessionId;

      aiModule.generateText = async function patchedGenerateText(
        ...args: unknown[]
      ): Promise<unknown> {
        const traceId = randomUUID();
        const spanId = randomUUID();
        const params = (args[0] ?? {}) as Record<string, unknown>;
        const model = params.model as Record<string, unknown> | undefined;
        const modelId = (model?.modelId as string) ?? "unknown-vercel-ai";

        const startTime = performance.now();

        try {
          const result = await originalGenerateText.apply(null, args);
          const latencyMs = Math.round(performance.now() - startTime);

          const res = result as Record<string, unknown>;
          const usage = res.usage as Record<string, number> | undefined;
          const promptTokens = usage?.promptTokens ?? 0;
          const completionTokens = usage?.completionTokens ?? 0;
          const totalTokens = promptTokens + completionTokens;
          const cost = calculateCost(modelId, promptTokens, completionTokens);

          telemetryClient.logEvent({
            trace_id: traceId,
            span_id: spanId,
            session_id: sessionId,
            agent_id: agentId,
            provider: "vercel-ai",
            model: modelId,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cost,
            latency_ms: latencyMs,
            status: "success",
            span_type: "llm_call",
            metadata: {
              function: "generateText",
              finishReason: res.finishReason,
            },
          });

          return result;
        } catch (err) {
          const latencyMs = Math.round(performance.now() - startTime);

          telemetryClient.logEvent({
            trace_id: traceId,
            span_id: spanId,
            session_id: sessionId,
            agent_id: agentId,
            provider: "vercel-ai",
            model: modelId,
            latency_ms: latencyMs,
            status: "error",
            error: String(err),
            span_type: "llm_call",
          });

          throw err;
        }
      };

      (aiModule as Record<string, unknown>)._aiops_generateText_patched = true;
    } catch {
      // ai package not installed
    }
  }

  private patchStreamText(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const aiModule = require("ai");
      if (!aiModule.streamText || (aiModule as Record<string, unknown>)._aiops_streamText_patched) return;

      const originalStreamText = aiModule.streamText;
      const telemetryClient = this.client;
      const agentId = this.agentId;
      const sessionId = this.sessionId;

      aiModule.streamText = function patchedStreamText(
        ...args: unknown[]
      ): unknown {
        const traceId = randomUUID();
        const spanId = randomUUID();
        const params = (args[0] ?? {}) as Record<string, unknown>;
        const model = params.model as Record<string, unknown> | undefined;
        const modelId = (model?.modelId as string) ?? "unknown-vercel-ai";
        const startTime = performance.now();

        const result = originalStreamText.apply(null, args);

        // The streamText returns an object with a .usage promise we can hook into
        const streamResult = result as Record<string, unknown>;

        if (typeof streamResult.usage === "object" && streamResult.usage !== null && "then" in (streamResult.usage as object)) {
          (streamResult.usage as Promise<Record<string, number>>)
            .then((usage) => {
              const latencyMs = Math.round(performance.now() - startTime);
              const promptTokens = usage?.promptTokens ?? 0;
              const completionTokens = usage?.completionTokens ?? 0;
              const totalTokens = promptTokens + completionTokens;
              const cost = calculateCost(modelId, promptTokens, completionTokens);

              telemetryClient.logEvent({
                trace_id: traceId,
                span_id: spanId,
                session_id: sessionId,
                agent_id: agentId,
                provider: "vercel-ai",
                model: modelId,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                cost,
                latency_ms: latencyMs,
                status: "success",
                span_type: "llm_call",
                metadata: { function: "streamText" },
              });
            })
            .catch((err: unknown) => {
              const latencyMs = Math.round(performance.now() - startTime);
              telemetryClient.logEvent({
                trace_id: traceId,
                span_id: spanId,
                session_id: sessionId,
                agent_id: agentId,
                provider: "vercel-ai",
                model: modelId,
                latency_ms: latencyMs,
                status: "error",
                error: String(err),
                span_type: "llm_call",
              });
            });
        }

        return result;
      };

      (aiModule as Record<string, unknown>)._aiops_streamText_patched = true;
    } catch {
      // ai package not installed
    }
  }
}
