"use client";

import { useState } from "react";
import { MOCK_ERRORS, ErrorGroup } from "@/lib/mockData";
import { 
  Bug, 
  AlertTriangle, 
  Clock, 
  Users, 
  Terminal, 
  Copy, 
  Check, 
  Code,
  FileText,
  Activity
} from "lucide-react";

export default function ErrorsPage() {
  const [errorGroups] = useState<ErrorGroup[]>(MOCK_ERRORS);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(MOCK_ERRORS[0].error_id);
  const [activeSubTab, setActiveSubTab] = useState<"stack" | "context">("stack");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const selectedGroup = errorGroups.find(e => e.error_id === selectedGroupId) || errorGroups[0];

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getExceptionBadgeColor = (type: string) => {
    switch (type) {
      case "RateLimitError":
        return "bg-accent-warning/10 text-accent-warning border-accent-warning/20";
      case "TimeoutError":
        return "bg-accent-error/10 text-accent-error border-accent-error/20";
      case "OperationalError":
        return "bg-accent-error/15 text-accent-error border-accent-error/30";
      default:
        return "bg-bg-elevated text-text-muted border-border-muted";
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-base overflow-hidden">
      {/* Page Header */}
      <header className="h-16 border-b border-border-muted flex items-center justify-between px-8 bg-bg-surface shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Bug className="h-5 w-5 text-accent-error" />
          <h1 className="text-sm font-semibold tracking-tight text-text-primary">
            Sentry Error Grouping
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-muted">
            {errorGroups.length} unresolved issue groups
          </span>
        </div>
      </header>

      {/* Main Workspace Split */}
      <div className="flex-1 flex min-h-0">
        
        {/* Left Column (Exceptions List Grid) */}
        <section className="flex-1 flex flex-col h-full overflow-hidden border-r border-border-muted bg-bg-base/20">
          {/* Top Aggregations summary */}
          <div className="grid grid-cols-3 border-b border-border-muted shrink-0 text-center select-none font-mono">
            <div className="p-4 border-r border-border-muted bg-bg-surface/30">
              <span className="text-[8px] uppercase tracking-wider text-text-dim block">Active Issues</span>
              <span className="text-sm font-bold text-text-primary mt-0.5 block">{errorGroups.length}</span>
            </div>
            <div className="p-4 border-r border-border-muted bg-bg-surface/30">
              <span className="text-[8px] uppercase tracking-wider text-text-dim block">Total Events</span>
              <span className="text-sm font-bold text-accent-error mt-0.5 block">238</span>
            </div>
            <div className="p-4 bg-bg-surface/30">
              <span className="text-[8px] uppercase tracking-wider text-text-dim block">Affected Sessions</span>
              <span className="text-sm font-bold text-text-muted mt-0.5 block">46</span>
            </div>
          </div>

          {/* Table Header Row */}
          <div className="flex items-center px-6 py-2.5 bg-bg-surface border-b border-border-muted text-[10px] font-mono text-text-dim shrink-0">
            <div className="w-1/2">Issue Group / Exception Type</div>
            <div className="w-1/4 text-center">Events</div>
            <div className="w-1/4 text-right">Last Seen</div>
          </div>

          {/* Grouped Exceptions Feed */}
          <div className="flex-1 overflow-y-auto divide-y divide-border-muted/30">
            {errorGroups.map((group) => {
              const isSelected = group.error_id === selectedGroupId;
              return (
                <div
                  key={group.error_id}
                  onClick={() => setSelectedGroupId(group.error_id)}
                  className={`flex items-center px-6 py-3.5 cursor-pointer transition-all ${
                    isSelected 
                      ? "bg-bg-elevated/70 border-r-2 border-accent-error" 
                      : "hover:bg-bg-elevated/20"
                  }`}
                >
                  {/* Issue title */}
                  <div className="w-1/2 min-w-0 pr-4 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 border rounded shrink-0 ${getExceptionBadgeColor(group.exception_type)}`}>
                        {group.exception_type}
                      </span>
                      <span className="font-sans font-medium text-[11px] text-text-dim truncate">
                        {group.agent_name}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-text-primary truncate font-semibold" title={group.message}>
                      {group.message}
                    </p>
                  </div>

                  {/* Occurrences count */}
                  <div className="w-1/4 text-center space-y-0.5">
                    <span className="font-mono text-xs font-bold text-text-primary block">
                      {group.occurrences}
                    </span>
                    <span className="text-[9px] font-mono text-text-dim block">
                      {group.affected_sessions} users
                    </span>
                  </div>

                  {/* Last seen */}
                  <div className="w-1/4 text-right">
                    <span className="font-mono text-xs text-text-muted">
                      {getRelativeTime(group.last_seen)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column (Stack Trace Detail Inspector) */}
        <section className="w-[450px] shrink-0 bg-bg-surface flex flex-col h-full overflow-hidden">
          {selectedGroup ? (
            <>
              {/* Header Details */}
              <div className="p-6 border-b border-border-muted bg-bg-base/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1 border rounded ${getExceptionBadgeColor(selectedGroup.exception_type)}`}>
                    {selectedGroup.exception_type}
                  </span>
                  <span className="text-[10px] font-mono text-text-dim flex items-center gap-1">
                    <Users className="h-3 w-3" /> {selectedGroup.affected_sessions} sessions hit
                  </span>
                </div>
                
                <h2 className="text-xs font-mono font-bold text-text-primary leading-relaxed break-words">
                  {selectedGroup.message}
                </h2>
                
                <div className="flex items-center justify-between text-[10px] font-mono text-text-muted border-t border-border-muted/30 pt-2.5">
                  <span>Agent: {selectedGroup.agent_name}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-text-dim" /> Last: {new Date(selectedGroup.last_seen).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Sub tabs controllers (Stack Trace vs prompt parameters) */}
              <div className="px-6 py-2 border-b border-border-muted bg-bg-base/15 flex items-center justify-between shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveSubTab("stack")}
                    className={`px-3 py-1 rounded font-mono text-[10px] font-bold border transition-all ${
                      activeSubTab === "stack"
                        ? "bg-bg-elevated border-border-muted text-accent-error"
                        : "border-transparent text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Stack Trace
                  </button>
                  <button
                    onClick={() => setActiveSubTab("context")}
                    className={`px-3 py-1 rounded font-mono text-[10px] font-bold border transition-all ${
                      activeSubTab === "context"
                        ? "bg-bg-elevated border-border-muted text-accent-info"
                        : "border-transparent text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Payload Context
                  </button>
                </div>

                <button
                  onClick={() => handleCopyText(
                    activeSubTab === "stack" 
                      ? selectedGroup.stack_trace 
                      : selectedGroup.prompt_input
                  )}
                  className="text-[9px] font-mono text-text-dim hover:text-text-primary flex items-center gap-1 hover:bg-bg-elevated p-1 rounded transition-colors"
                >
                  {copiedText === (activeSubTab === "stack" ? selectedGroup.stack_trace : selectedGroup.prompt_input) ? (
                    <Check className="h-3 w-3 text-accent-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  Copy Details
                </button>
              </div>

              {/* Console logs container */}
              <div className="flex-1 p-6 overflow-y-auto">
                {activeSubTab === "stack" ? (
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim flex items-center gap-1">
                      <Terminal className="h-3 w-3" /> Python Runtime traceback
                    </span>
                    <pre className="p-4 bg-bg-base border border-border-muted rounded text-[10px] font-mono text-accent-error leading-relaxed overflow-x-auto whitespace-pre">
                      {selectedGroup.stack_trace}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Input prompt
                      </span>
                      <pre className="p-4 bg-bg-base border border-border-muted rounded text-[10px] font-mono text-text-muted leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {selectedGroup.prompt_input}
                      </pre>
                    </div>

                    <div className="bg-bg-base/30 border border-border-muted rounded p-3 text-[10px] font-mono text-text-muted space-y-1.5">
                      <span className="text-[9px] uppercase font-bold text-text-dim block">Automatic Resolution Info</span>
                      <p className="leading-normal">
                        This issue matches patterns of type <b className="text-text-primary">{selectedGroup.exception_type}</b>.
                        Consider adjusting model timeouts or configuring exponential backoff retries within the SDK payload pipeline to prevent connection drop losses.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <span className="text-xs text-text-dim">Select an issue from the grid to trace errors.</span>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
