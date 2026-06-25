"use client";

import { useState } from "react";
import { MOCK_TRACES, Trace } from "@/lib/mockData";
import WaterfallChart from "@/components/traces/WaterfallChart";
import WorkflowDAG from "@/components/traces/WorkflowDAG";
import { 
  Search, 
  Filter, 
  Activity, 
  Copy, 
  Check, 
  ArrowRight,
  Clock, 
  Coins, 
  Layers,
  Sparkles
} from "lucide-react";

export default function TracesPage() {
  const [traces] = useState<Trace[]>(MOCK_TRACES);
  const [selectedTraceId, setSelectedTraceId] = useState<string>(MOCK_TRACES[0].trace_id);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");
  const [viewMode, setViewMode] = useState<"waterfall" | "dag">("waterfall");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedTrace = traces.find(t => t.trace_id === selectedTraceId) || traces[0];

  // Filtering logic
  const filteredTraces = traces.filter(trace => {
    const matchesSearch = 
      trace.agent_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      trace.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trace.trace_id.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesStatus = 
      statusFilter === "all" || 
      trace.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFormatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-base overflow-hidden">
      {/* Page Header */}
      <header className="h-16 border-b border-border-muted flex items-center justify-between px-8 bg-bg-surface shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-accent-info" />
          <h1 className="text-sm font-semibold tracking-tight text-text-primary">
            Distributed Trace Logs
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-muted">
            {traces.length} active sessions
          </span>
        </div>
      </header>

      {/* Main Workspace Split Screen */}
      <div className="flex-1 flex min-h-0">
        
        {/* Left Column (Master Master-List) */}
        <section className="w-[380px] shrink-0 border-r border-border-muted flex flex-col h-full bg-bg-surface/50 overflow-hidden">
          {/* Filters & Search */}
          <div className="p-4 border-b border-border-muted space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-dim" />
              <input
                type="text"
                placeholder="Search by Agent, Session, or Trace ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-base border border-border-muted rounded pl-9 pr-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-dim focus:outline-none focus:border-text-muted transition-colors"
              />
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3 w-3 text-text-dim" />
                <span className="text-[10px] font-mono uppercase text-text-dim">Status</span>
              </div>
              <div className="flex rounded border border-border-muted overflow-hidden text-[10px] font-mono">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 transition-colors ${statusFilter === "all" ? "bg-bg-elevated text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter("success")}
                  className={`px-3 py-1 border-x border-border-muted transition-colors ${statusFilter === "success" ? "bg-bg-elevated text-accent-success" : "text-text-muted hover:text-text-primary"}`}
                >
                  Success
                </button>
                <button
                  onClick={() => setStatusFilter("error")}
                  className={`px-3 py-1 transition-colors ${statusFilter === "error" ? "bg-bg-elevated text-accent-error" : "text-text-muted hover:text-text-primary"}`}
                >
                  Errors
                </button>
              </div>
            </div>
          </div>

          {/* Trace Cards Feed */}
          <div className="flex-1 overflow-y-auto divide-y divide-border-muted/30">
            {filteredTraces.length > 0 ? (
              filteredTraces.map((trace) => {
                const isSelected = trace.trace_id === selectedTraceId;
                return (
                  <div
                    key={trace.trace_id}
                    onClick={() => setSelectedTraceId(trace.trace_id)}
                    className={`p-4 cursor-pointer transition-all ${
                      isSelected 
                        ? "bg-bg-elevated/80 border-r-2 border-accent-info" 
                        : "hover:bg-bg-elevated/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-sans font-semibold text-xs text-text-primary truncate max-w-[200px]">
                        {trace.agent_name}
                      </span>
                      <span className="text-[10px] font-mono text-text-dim">
                        {getFormatTime(trace.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-text-muted truncate max-w-[150px]">
                        {trace.session_id}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-text-muted flex items-center gap-0.5">
                          <Clock className="h-3 w-3 text-text-dim" /> {trace.latency_ms}ms
                        </span>
                        <span className="text-accent-success flex items-center gap-0.5 font-medium">
                          <Coins className="h-3 w-3" /> ${trace.cost.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[9px] font-mono text-text-dim truncate max-w-[180px]">
                        ID: {trace.trace_id.substring(0, 8)}...
                      </span>
                      <span className={`text-[9px] font-mono font-bold uppercase ${
                        trace.status === "success" ? "text-accent-success" : "text-accent-error"
                      }`}>
                        ● {trace.status}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs text-text-dim">
                No matching traces found.
              </div>
            )}
          </div>
        </section>

        {/* Right Column (Detail Viewport) */}
        <section className="flex-1 flex flex-col h-full bg-bg-base overflow-hidden p-6 space-y-6">
          {selectedTrace ? (
            <>
              {/* Detail Header Summary Bar */}
              <div className="bg-bg-surface border border-border-muted rounded p-5 flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-text-primary">
                      {selectedTrace.agent_name}
                    </h2>
                    <span className="text-[10px] font-mono text-text-dim">({selectedTrace.project_id})</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-text-muted">
                    <span className="text-text-dim">Trace ID:</span>
                    <span className="text-text-primary select-all">{selectedTrace.trace_id}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedTrace.trace_id)}
                      className="text-text-dim hover:text-text-primary p-0.5 rounded hover:bg-bg-elevated transition-colors"
                      title="Copy Trace ID"
                    >
                      {copiedId === selectedTrace.trace_id ? (
                        <Check className="h-3.5 w-3.5 text-accent-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Performance stats badges */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] font-mono uppercase text-text-dim block">Total Cost</span>
                    <span className="font-mono text-sm font-bold text-accent-success flex items-center justify-end gap-1">
                      <Coins className="h-4 w-4" /> ${selectedTrace.cost.toFixed(5)}
                    </span>
                  </div>
                  <div className="border-l border-border-muted h-8" />
                  <div className="text-right">
                    <span className="text-[9px] font-mono uppercase text-text-dim block">Duration</span>
                    <span className="font-mono text-sm font-bold text-accent-info flex items-center justify-end gap-1">
                      <Clock className="h-4 w-4" /> {selectedTrace.latency_ms} ms
                    </span>
                  </div>
                  <div className="border-l border-border-muted h-8" />
                  <div className="text-right">
                    <span className="text-[9px] font-mono uppercase text-text-dim block">Spans</span>
                    <span className="font-mono text-sm font-bold text-text-primary flex items-center justify-end gap-1">
                      <Layers className="h-4 w-4 text-text-muted" /> {selectedTrace.spans.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* View Controller (Gantt vs DAG toggle) */}
              <div className="flex items-center justify-between border-b border-border-muted/50 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode("waterfall")}
                    className={`px-4 py-1.5 rounded font-mono text-xs font-semibold border transition-all ${
                      viewMode === "waterfall"
                        ? "bg-bg-surface border-border-muted text-accent-info"
                        : "border-transparent text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Waterfall Timeline
                  </button>
                  <button
                    onClick={() => setViewMode("dag")}
                    className={`px-4 py-1.5 rounded font-mono text-xs font-semibold border transition-all ${
                      viewMode === "dag"
                        ? "bg-bg-surface border-border-muted text-accent-info"
                        : "border-transparent text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Workflow DAG
                  </button>
                </div>

                <div className="text-[10px] font-mono text-text-dim flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-accent-success" /> Session: {selectedTrace.session_id}
                </div>
              </div>

              {/* Visual Panel */}
              <div className="flex-1 min-h-0">
                {viewMode === "waterfall" ? (
                  <WaterfallChart trace={selectedTrace} />
                ) : (
                  <WorkflowDAG trace={selectedTrace} />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-dim">
              <span className="text-sm">Select a trace from the left panel to inspect execution spans.</span>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
