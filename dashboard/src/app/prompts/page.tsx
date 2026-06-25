"use client";

import { useState } from "react";
import { MOCK_PROMPTS, MOCK_TRACES, PromptItem, PromptVersion } from "@/lib/mockData";
import { 
  Terminal, 
  Layers, 
  Play, 
  Clock, 
  Coins, 
  CheckCircle2, 
  Copy, 
  Check, 
  RefreshCw, 
  Code,
  Sparkles,
  Database
} from "lucide-react";

export default function PromptsPage() {
  const [prompts] = useState<PromptItem[]>(MOCK_PROMPTS);
  const [selectedPromptId, setSelectedPromptId] = useState<string>(MOCK_PROMPTS[0].id);
  const [activeTab, setActiveTab] = useState<"versions" | "playground">("versions");
  
  // Playground state
  const [playgroundPrompt, setPlaygroundPrompt] = useState("");
  const [playgroundVariables, setPlaygroundVariables] = useState<Record<string, string>>({
    order_details: "Order #90812, invoice disputed due to double charge. Refund value: $45.00."
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId) || prompts[0];

  // Sync playground text when prompt changes
  const handleSelectPrompt = (prompt: PromptItem) => {
    setSelectedPromptId(prompt.id);
    setPlaygroundPrompt(prompt.versions[0].prompt_text);
    // Auto populate custom parameters based on template
    if (prompt.id === "prompt-dispute-eval") {
      setPlaygroundVariables({
        order_details: "Order #90812, double charge refund request."
      });
    } else {
      setPlaygroundVariables({
        user_query: "I want to track my package shipped yesterday."
      });
    }
    setSimulationResult(null);
  };

  // Initialize playground prompt if empty
  if (!playgroundPrompt && selectedPrompt) {
    setPlaygroundPrompt(selectedPrompt.versions[0].prompt_text);
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleImportLog = (trace: typeof MOCK_TRACES[0]) => {
    if (selectedPrompt.id === "prompt-dispute-eval") {
      const rootSpan = trace.spans.find(s => s.span_type === "agent_run");
      setPlaygroundVariables({
        order_details: JSON.stringify(rootSpan?.metadata || { task: "Invoice dispute" })
      });
    } else {
      const rootSpan = trace.spans.find(s => s.span_type === "agent_run");
      setPlaygroundVariables({
        user_query: rootSpan?.metadata?.user_question || "Dispatched query"
      });
    }
  };

  const runSimulation = () => {
    setIsSimulating(true);
    setSimulationResult(null);
    setTimeout(() => {
      setIsSimulating(false);
      // Generate a mock simulation output
      const tokensIn = Math.floor(playgroundPrompt.length / 4) + 120;
      const tokensOut = 75;
      const rate = selectedPrompt.active_model === "gpt-4o" ? 0.000015 : 0.000002;
      const cost = (tokensIn * rate) + (tokensOut * rate * 3);
      
      setSimulationResult({
        output: selectedPrompt.id === "prompt-dispute-eval" 
          ? `{\n  "refund_eligible": true,\n  "action": "issue_chargeback",\n  "amount_cents": 4500,\n  "audit_reason": "Double billing identified in logs: Stripe charge ch_1Nst8291X0 was processed twice."\n}`
          : `{\n  "classified_intent": "shipping",\n  "confidence_score": 0.992,\n  "routing_target": "delivery_support_queue"\n}`,
        latency_ms: Math.floor(Math.random() * 200) + 250,
        cost,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        total_tokens: tokensIn + tokensOut
      });
    }, 1200);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-base overflow-hidden">
      {/* Page Header */}
      <header className="h-16 border-b border-border-muted flex items-center justify-between px-8 bg-bg-surface shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-accent-info" />
          <h1 className="text-sm font-semibold tracking-tight text-text-primary">
            Prompt Registry & Playground
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-muted">
            {prompts.length} prompt categories
          </span>
        </div>
      </header>

      {/* Main Workspace Split */}
      <div className="flex-1 flex min-h-0">
        
        {/* Left Column (Prompt Selector) */}
        <section className="w-[320px] shrink-0 border-r border-border-muted flex flex-col h-full bg-bg-surface/50 overflow-hidden">
          <div className="p-4 border-b border-border-muted shrink-0">
            <span className="text-[10px] font-mono uppercase text-text-dim block">Templates Catalog</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border-muted/30">
            {prompts.map((prompt) => {
              const isSelected = prompt.id === selectedPromptId;
              return (
                <div
                  key={prompt.id}
                  onClick={() => handleSelectPrompt(prompt)}
                  className={`p-4 cursor-pointer transition-all ${
                    isSelected 
                      ? "bg-bg-elevated/80 border-r-2 border-accent-info" 
                      : "hover:bg-bg-elevated/30"
                  }`}
                >
                  <div className="font-sans font-semibold text-xs text-text-primary mb-1 truncate">
                    {prompt.name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
                    <span>Model: {prompt.active_model}</span>
                    <span>{prompt.versions.length} versions</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column (Prompts Detail Inspector & Sandbox) */}
        <section className="flex-1 flex flex-col h-full bg-bg-base overflow-hidden p-6 space-y-4">
          
          {/* Section Selector Tab controller */}
          <div className="flex items-center justify-between border-b border-border-muted/50 pb-2 shrink-0">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("versions")}
                className={`px-4 py-1.5 rounded font-mono text-xs font-semibold border transition-all ${
                  activeTab === "versions"
                    ? "bg-bg-surface border-border-muted text-accent-info"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                Version Analysis
              </button>
              <button
                onClick={() => setActiveTab("playground")}
                className={`px-4 py-1.5 rounded font-mono text-xs font-semibold border transition-all ${
                  activeTab === "playground"
                    ? "bg-bg-surface border-border-muted text-accent-info"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                Playground Sandbox
              </button>
            </div>
            
            <div className="text-[10px] font-mono text-text-dim uppercase">
              Selected: {selectedPrompt.name}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === "versions" ? (
              /* TAB 1: VERSION CONTROL LIST & HISTORICAL COMPARISON */
              <div className="space-y-6">
                
                {/* Visual statistics comparison */}
                <div className="space-y-3">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-text-muted">
                    Telemetry Differences by Version
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                    {selectedPrompt.versions.map((ver) => (
                      <div 
                        key={ver.version} 
                        className={`bg-bg-surface border p-4 rounded space-y-3 ${
                          ver.status === "active" ? "border-accent-info/30 shadow-[0_0_12px_rgba(116,203,244,0.03)]" : "border-border-muted"
                        }`}
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-border-muted/50">
                          <span className="font-bold text-text-primary">{ver.version}</span>
                          <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
                            ver.status === "active" ? "bg-accent-info/10 text-accent-info" : "bg-bg-elevated text-text-dim"
                          }`}>
                            {ver.status}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-text-dim">Avg Latency:</span>
                            <span className="text-accent-info font-semibold flex items-center gap-0.5">
                              <Clock className="h-3 w-3" /> {ver.latency_ms}ms
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-dim">Average Cost:</span>
                            <span className="text-accent-success font-semibold flex items-center gap-0.5">
                              <Coins className="h-3 w-3" /> ${ver.cost.toFixed(5)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-dim">Success Rate:</span>
                            <span className="text-text-primary font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3 text-accent-success" /> {ver.success_rate}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Prompt Template Body Inspection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-text-muted">
                      Prompt Template Body (Active Version)
                    </h3>
                    <button
                      onClick={() => handleCopyText(selectedPrompt.versions[0].prompt_text)}
                      className="text-[10px] font-mono text-text-dim hover:text-text-primary flex items-center gap-1 bg-bg-surface border border-border-muted px-2.5 py-1 rounded transition-colors"
                    >
                      {copiedText === selectedPrompt.versions[0].prompt_text ? (
                        <Check className="h-3 w-3 text-accent-success" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Copy Template
                    </button>
                  </div>
                  <pre className="p-4 bg-bg-surface border border-border-muted rounded text-[11px] font-mono text-text-muted whitespace-pre-wrap leading-relaxed select-all">
                    {selectedPrompt.versions[0].prompt_text}
                  </pre>
                </div>
              </div>
            ) : (
              /* TAB 2: PROMPT PLAYGROUND SANDBOX */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-[480px]">
                
                {/* Code Editor and variables pane */}
                <div className="space-y-4 flex flex-col">
                  {/* Template Edit Box */}
                  <div className="flex-1 flex flex-col min-h-[220px]">
                    <span className="text-[10px] font-mono uppercase text-text-dim block mb-1">
                      Template Draft Box (Modify parameters like {"{{variable}}"})
                    </span>
                    <textarea
                      value={playgroundPrompt}
                      onChange={(e) => setPlaygroundPrompt(e.target.value)}
                      className="w-full flex-1 bg-bg-surface border border-border-muted rounded p-3 text-xs font-mono text-text-primary placeholder:text-text-dim focus:outline-none focus:border-text-muted resize-none leading-relaxed"
                    />
                  </div>

                  {/* Variables Configuration panel */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-t border-border-muted/50 pt-3">
                      <span className="text-[10px] font-mono uppercase text-text-dim">Template Parameters</span>
                      <span className="text-[9px] font-mono text-text-dim flex items-center gap-1">
                        <Database className="h-3 w-3 text-accent-success" /> ClickHouse replay sandbox
                      </span>
                    </div>

                    <div className="space-y-2">
                      {Object.keys(playgroundVariables).map((key) => (
                        <div key={key} className="space-y-1">
                          <label className="text-[10px] font-mono font-bold text-accent-info block">
                            {`{{${key}}}`}
                          </label>
                          <textarea
                            value={playgroundVariables[key]}
                            onChange={(e) => setPlaygroundVariables({
                              ...playgroundVariables,
                              [key]: e.target.value
                            })}
                            rows={2}
                            className="w-full bg-bg-surface border border-border-muted rounded p-2 text-xs font-mono text-text-muted placeholder:text-text-dim focus:outline-none focus:border-text-muted resize-none"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Import parameter from past transaction telemetry */}
                    <div className="bg-bg-surface border border-border-muted rounded p-3">
                      <span className="text-[9px] font-mono uppercase text-text-dim block mb-2">Import dataset from Trace Log</span>
                      <div className="flex flex-wrap gap-2">
                        {MOCK_TRACES.map((trace, i) => (
                          <button
                            key={trace.trace_id}
                            onClick={() => handleImportLog(trace)}
                            className="text-[9px] font-mono bg-bg-base hover:bg-bg-elevated border border-border-muted px-2.5 py-1.5 rounded text-text-muted hover:text-text-primary transition-all flex items-center gap-1"
                          >
                            <Sparkles className="h-2.5 w-2.5 text-accent-success" /> Trace #{i+1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={runSimulation}
                      disabled={isSimulating}
                      className="w-full bg-bg-elevated border border-border-muted hover:border-text-dim px-4 py-2.5 rounded font-mono text-xs font-bold text-text-primary transition-all hover:bg-bg-elevated/70 flex items-center justify-center gap-2"
                    >
                      {isSimulating ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-accent-info" />
                          Simulating Transaction...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 text-accent-success" />
                          Execute Simulation
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Simulation Output pane */}
                <div className="bg-bg-surface border border-border-muted rounded flex flex-col h-full overflow-hidden">
                  <div className="px-4 py-3 border-b border-border-muted bg-bg-base/40 flex items-center justify-between font-mono text-xs text-text-muted">
                    <span className="flex items-center gap-1"><Code className="h-3.5 w-3.5 text-accent-info" /> Model Output Simulation</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-bg-base border border-border-muted font-bold">
                      {selectedPrompt.active_model}
                    </span>
                  </div>

                  <div className="flex-1 p-4 overflow-y-auto space-y-4 font-mono text-xs">
                    {simulationResult ? (
                      <>
                        {/* Simulation Metrics Bar */}
                        <div className="grid grid-cols-3 gap-2 bg-bg-base border border-border-muted/50 rounded p-3 text-[10px]">
                          <div>
                            <span className="text-[8px] uppercase tracking-wider text-text-dim block">Latency</span>
                            <span className="font-bold text-accent-info flex items-center gap-0.5 mt-0.5">
                              <Clock className="h-2.5 w-2.5" /> {simulationResult.latency_ms} ms
                            </span>
                          </div>
                          <div>
                            <span className="text-[8px] uppercase tracking-wider text-text-dim block">Cost</span>
                            <span className="font-bold text-accent-success flex items-center gap-0.5 mt-0.5">
                              <Coins className="h-2.5 w-2.5" /> ${simulationResult.cost.toFixed(5)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[8px] uppercase tracking-wider text-text-dim block">Tokens</span>
                            <span className="font-bold text-text-primary mt-0.5 block">
                              {simulationResult.total_tokens}t
                            </span>
                          </div>
                        </div>

                        {/* Text output */}
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-wider text-text-dim block">LLM Response</span>
                          <pre className="p-3 bg-bg-base border border-border-muted rounded text-[11px] leading-relaxed text-text-muted overflow-x-auto whitespace-pre-wrap">
                            {simulationResult.output}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 select-none">
                        <Terminal className="h-8 w-8 text-text-dim stroke-[1.5]" />
                        <p className="text-[11px] text-text-muted font-medium">Ready for execution</p>
                        <p className="text-[9px] text-text-dim leading-relaxed max-w-xs">
                          Click the simulation button on the left to resolve template values and verify LLM performance bounds.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
