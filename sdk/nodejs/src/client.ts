/**
 * AIOps Node.js Telemetry Client
 *
 * Async batching, exponential backoff, and local JSONL fallback.
 * Mirror of the Python SDK's TelemetryClient.
 */

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

export interface TelemetryEvent {
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string | null;
  session_id?: string;
  agent_id?: string;
  provider?: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  latency_ms?: number;
  status?: "success" | "error";
  error?: string | null;
  span_type?: "llm_call" | "tool_call" | "agent_run";
  metadata?: Record<string, unknown>;
}

export interface TelemetryClientOptions {
  apiKey: string;
  collectorUrl?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  fallbackFile?: string;
  maxRetries?: number;
}

export class TelemetryClient {
  private readonly apiKey: string;
  private readonly collectorUrl: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly fallbackFile: string;
  private readonly maxRetries: number;

  private queue: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  constructor(options: TelemetryClientOptions) {
    this.apiKey = options.apiKey;
    this.collectorUrl = (options.collectorUrl ?? "http://localhost:8000").replace(/\/+$/, "");
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.fallbackFile = options.fallbackFile ?? ".aiops_fallback_telemetry.jsonl";
    this.maxRetries = options.maxRetries ?? 3;

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);

    // Flush on process exit
    process.on("beforeExit", () => this.shutdown());
  }

  /**
   * Queue a telemetry event. Assigns trace_id and span_id if missing.
   */
  logEvent(event: TelemetryEvent): void {
    if (!event.trace_id) event.trace_id = randomUUID();
    if (!event.span_id) event.span_id = randomUUID();
    this.queue.push(event);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush all queued events.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    await this.sendBatch(batch);
  }

  /**
   * Send a batch of events with exponential backoff.
   */
  private async sendBatch(batch: TelemetryEvent[]): Promise<void> {
    const url = `${this.collectorUrl}/v1/telemetry/batch`;
    let backoff = 500;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const status = await this.httpPost(url, batch);
        if (status >= 200 && status < 300) return;

        if (status === 404) {
          // Batch endpoint not available, try individual sends
          await this.sendIndividually(batch);
          return;
        }
      } catch {
        // Network error, retry
      }

      await this.sleep(backoff);
      backoff *= 2;
    }

    // All retries failed: write to local fallback
    this.writeFallback(batch);
  }

  /**
   * Fallback: send events individually to /v1/telemetry.
   */
  private async sendIndividually(events: TelemetryEvent[]): Promise<void> {
    const url = `${this.collectorUrl}/v1/telemetry`;

    for (const event of events) {
      let sent = false;
      let backoff = 500;

      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const status = await this.httpPost(url, event);
          if (status >= 200 && status < 300) {
            sent = true;
            break;
          }
        } catch {
          // retry
        }
        await this.sleep(backoff);
        backoff *= 2;
      }

      if (!sent) {
        this.writeFallback([event]);
      }
    }
  }

  /**
   * Low-level HTTP POST returning status code.
   */
  private httpPost(url: string, body: unknown): Promise<number> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const data = JSON.stringify(body);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;

      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10_000,
        },
        (res) => {
          // Drain response body
          res.resume();
          resolve(res.statusCode ?? 500);
        },
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Append events to the local fallback JSONL file.
   */
  private writeFallback(events: TelemetryEvent[]): void {
    try {
      const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      fs.appendFileSync(this.fallbackFile, lines, "utf-8");
    } catch {
      // Silent failure: we can't do much if even local file write fails
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Flush remaining events and stop the background timer.
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush all remaining events
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      await this.sendBatch(batch);
    }
  }
}
