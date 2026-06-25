"use client";

import { useState } from "react";
import { TelemetrySpan, Trace } from "@/lib/mockData";
import { 
  Terminal, 
  Clock, 
  Coins, 
  ChevronRight, 
  ChevronDown, 
  HelpCircle,
  Play,
  Hammer,
  Cpu
} from "lucide-react";

interface WaterfallChartProps {
  trace: Trace;
}

export default function WaterfallChart({ trace }: WaterfallChartProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(
    trace.spans[0]?.span_id || null
  );

  const totalDuration = trace.latency_ms || 1;
  const selectedSpan = trace.spans.find(s => s.span_id === selectedSpanId);

  // Helper to get span-specific icons
  const getSpanIcon = (type: string) => {
    switch (type) {
      case "agent_run":
        return <Play className="h-3.5 w-3.5 text-accent-success" />;
      case "tool_call":
        return <Hammer className="h-3.5 w-3.5 text-accent-warning" />;
      case "llm_call":
        return <Cpu className="h-3.5 w-3.5 text-accent-info" />;
      default:
        return <HelpCircle className="h-3.5 w-3.5 text-text-muted" />;
    }
  };

  // Helper to color timelines
  const getSpanColorClass = (span: TelemetrySpan) => {
    if (span.status === "error") return "bg-accent-error border border-accent-error/40";
    switch (span.span_type) {
      case "agent_run":
        return "bg-accent-success/20 border border-accent-success/50";
      case "tool_call":
        return "bg-accent-warning/20 border border-accent-warning/50";
      case "llm_call":
        return "bg-accent-info/20 border border-accent-info/50";
      default:
        return "bg-text-muted/10 border border-text-muted/30";
    }
  };

  // Sort spans logically: depth-first search or start_offset_ms order
  const sortedSpans = [...trace.spans].sort((a, b) => a.start_offset_ms - b.start_offset_ms);

  return (
    <div className="flex flex-col lg:flex-row border border-border-muted bg-bg-surface rounded overflow-hidden h-[480px]">
      {/* Gantt Timeline View */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border-muted h-full">
        {/* Chart Header */}
        <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between bg-bg-base/50">
          <span className="text-xs font-mono text-text-muted">Execution Timelines</span>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-success/40 border border-accent-success" /> Agent</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-warning/40 border border-accent-warning" /> Tool</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent-info/40 border border-accent-info" /> LLM</span>
          </div>
        </div>

        {/* Timeline ruler */}
        <div className="flex px-4 py-1.5 border-b border-border-muted text-[10px] font-mono text-text-dim bg-bg-base/30">
          <div className="w-1/3 shrink-0">Span Name</div>
          <div className="flex-1 relative h-4">
            <div className="absolute left-0">0ms</div>
            <div className="absolute left-1/4 -translate-x-1/2">{(totalDuration * 0.25).toFixed(0)}ms</div>
            <div className="absolute left-1/2 -translate-x-1/2">{(totalDuration * 0.5).toFixed(0)}ms</div>
            <div className="absolute left-3/4 -translate-x-1/2">{(totalDuration * 0.75).toFixed(0)}ms</div>
            <div className="absolute right-0">{totalDuration}ms</div>
          </div>
        </div>

        {/* Spans List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border-muted/50">
          {sortedSpans.map((span) => {
            const leftPct = (span.start_offset_ms / totalDuration) * 100;
            const widthPct = Math.max((span.latency_ms / totalDuration) * 100, 1.5);
            const isSelected = span.span_id === selectedSpanId;

            // Indentation based on span parent structure (basic mock indentation)
            const hasParent = span.parent_span_id !== null;
            const indentClass = hasParent ? "pl-8" : "pl-4";

            return (
              <div 
                key={span.span_id}
                onClick={() => setSelectedSpanId(span.span_id)}
                className={`flex items-center px-4 py-2.5 cursor-pointer hover:bg-bg-elevated/40 transition-colors ${
                  isSelected ? "bg-bg-elevated border-l-2 border-accent-info" : ""
                }`}
              >
                {/* Span Title */}
                <div className={`w-1/3 shrink-0 flex items-center gap-2 overflow-hidden ${indentClass}`}>
                  {getSpanIcon(span.span_type)}
                  <span className="font-mono text-xs text-text-primary truncate" title={span.name}>
                    {span.name}
                  </span>
                </div>

                {/* Relative visual timeline bar */}
                <div className="flex-1 relative h-6 flex items-center">
                  <div 
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className={`absolute h-4.5 rounded-sm transition-all duration-300 flex items-center justify-between px-1.5 ${getSpanColorClass(span)}`}
                  >
                    <span className="text-[9px] font-mono text-text-primary font-medium truncate select-none">
                      {span.latency_ms}ms
                    </span>
                    {span.cost && span.cost > 0 && (
                      <span className="text-[8px] font-mono text-accent-success/90 select-none hidden md:inline">
                        ${span.cost.toFixed(5)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Details Side-Sheet Panel */}
      <div className="w-full lg:w-[320px] bg-bg-surface flex flex-col h-full overflow-hidden shrink-0">
        <div className="px-4 py-3 border-b border-border-muted bg-bg-base/40 flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs font-mono font-medium text-text-muted">Metadata Inspector</span>
        </div>

        {selectedSpan ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
            {/* Span Header */}
            <div>
              <span className="text-[9px] uppercase tracking-wider text-text-dim block">Span Type / Name</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-1.5 py-0.5 rounded bg-bg-elevated border border-border-muted text-[10px] text-text-muted">
                  {selectedSpan.span_type}
                </span>
                <span className="text-text-primary font-bold text-xs truncate" title={selectedSpan.name}>
                  {selectedSpan.name}
                </span>
              </div>
            </div>

            {/* Performance Stats */}
            <div className="grid grid-cols-2 gap-3 border-y border-border-muted/50 py-3">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-text-dim block">Latency</span>
                <span className="text-text-primary font-bold flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3 text-accent-info" /> {selectedSpan.latency_ms} ms
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-text-dim block">Status</span>
                <span className={`font-bold mt-0.5 inline-block ${
                  selectedSpan.status === "success" ? "text-accent-success" : "text-accent-error"
                }`}>
                  {selectedSpan.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* LLM Call Pricing & Models */}
            {selectedSpan.span_type === "llm_call" && (
              <div className="space-y-3 bg-bg-base/40 border border-border-muted rounded p-3 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-text-dim">Model:</span>
                  <span className="text-text-primary font-bold">{selectedSpan.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Provider:</span>
                  <span className="text-text-muted uppercase text-[10px]">{selectedSpan.provider}</span>
                </div>
                {selectedSpan.cost !== undefined && (
                  <div className="flex justify-between border-t border-border-muted/30 pt-2">
                    <span className="text-text-dim">Cost:</span>
                    <span className="text-accent-success font-semibold flex items-center gap-0.5">
                      <Coins className="h-2.5 w-2.5" /> ${selectedSpan.cost.toFixed(5)}
                    </span>
                  </div>
                )}
                {selectedSpan.total_tokens !== undefined && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-dim">Tokens:</span>
                    <span className="text-text-muted">
                      {selectedSpan.prompt_tokens}p + {selectedSpan.completion_tokens}c = {selectedSpan.total_tokens}t
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {selectedSpan.status === "error" && selectedSpan.error_message && (
              <div className="bg-accent-error/10 border border-accent-error/30 text-accent-error/90 rounded p-3 space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-wide">Error Trace</span>
                <p className="text-[11px] leading-tight break-all">
                  {selectedSpan.error_message}
                </p>
              </div>
            )}

            {/* Custom Metadata Payload */}
            <div className="space-y-1.5">
              <span className="text-[9px] uppercase tracking-wider text-text-dim block">Payload / Args</span>
              <pre className="p-3 bg-bg-base border border-border-muted rounded text-[10px] leading-relaxed text-text-muted overflow-x-auto whitespace-pre-wrap max-h-40">
                {JSON.stringify(selectedSpan.metadata, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <span className="text-xs text-text-dim">Select a span to view metadata.</span>
          </div>
        )}
      </div>
    </div>
  );
}
