"use client";

import { useState } from "react";
import { 
  MOCK_COST_TREND, 
  MOCK_FINOPS_RECOMMENDATIONS, 
  MOCK_TRACES 
} from "@/lib/mockData";
import { 
  Coins, 
  TrendingUp, 
  ArrowUpRight, 
  Lightbulb, 
  TrendingDown, 
  Database,
  Layers,
  Sparkles,
  Zap
} from "lucide-react";

export default function FinOpsPage() {
  const [recommendations] = useState(MOCK_FINOPS_RECOMMENDATIONS);
  const [costTrend] = useState(MOCK_COST_TREND);

  // Math for custom SVG chart
  const maxCost = Math.max(...costTrend.map(d => d.total));
  const svgHeight = 160;
  const svgWidth = 500;

  // Generate SVG path coordinates for the area chart
  const points = costTrend.map((d, i) => {
    const x = (i / (costTrend.length - 1)) * svgWidth;
    const y = svgHeight - (d.total / maxCost) * (svgHeight - 20) - 10;
    return `${x},${y}`;
  });

  const areaPath = `M 0,${svgHeight} L ${points.join(" L ")} L ${svgWidth},${svgHeight} Z`;
  const linePath = `M ${points.join(" L ")}`;

  // Math for agent allocations
  const agentCosts = MOCK_TRACES.reduce((acc, trace) => {
    acc[trace.agent_name] = (acc[trace.agent_name] || 0) + trace.cost;
    return acc;
  }, {} as Record<string, number>);

  const totalAgentCost = Object.values(agentCosts).reduce((a, b) => a + b, 0);

  // Math for model allocations (mocking model totals based on trend last day)
  const lastTrend = costTrend[costTrend.length - 1];
  const totalModelCost = lastTrend.openai + lastTrend.anthropic + lastTrend.cohere;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-base overflow-y-auto">
      {/* Page Header */}
      <header className="h-16 border-b border-border-muted flex items-center justify-between px-8 bg-bg-surface shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Coins className="h-5 w-5 text-accent-success" />
          <h1 className="text-sm font-semibold tracking-tight text-text-primary">
            FinOps Cost Intelligence
          </h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-elevated border border-border-muted text-text-muted">
            Pricing Engine Local Cache OK
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* Core Financial Indicators Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 select-none">
          <div className="bg-bg-surface border border-border-muted rounded p-5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 text-text-dim">
              <span className="text-[10px] uppercase font-mono tracking-wider">Total Spend (Last 24h)</span>
              <TrendingUp className="h-4 w-4 text-accent-error" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-text-primary">$185.10</span>
              <span className="font-mono text-[10px] text-accent-error font-medium flex items-center">
                +12.4% <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
            <p className="text-[10px] text-text-dim font-mono mt-1">Across 3 agents and 4,812 tokens</p>
          </div>

          <div className="bg-bg-surface border border-border-muted rounded p-5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 text-text-dim">
              <span className="text-[10px] uppercase font-mono tracking-wider">Token Aggregations</span>
              <Database className="h-4 w-4 text-accent-info" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-text-primary">18.4M</span>
              <span className="text-[10px] text-text-muted">Total Tokens</span>
            </div>
            <p className="text-[10px] text-text-dim font-mono mt-1">
              12.2M input / 6.2M completion
            </p>
          </div>

          <div className="bg-bg-surface border border-border-muted rounded p-5 relative overflow-hidden border-accent-success/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
            <div className="flex items-center justify-between mb-3 text-text-dim">
              <span className="text-[10px] uppercase font-mono tracking-wider">Optimization Savings</span>
              <Lightbulb className="h-4 w-4 text-accent-success" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-accent-success">$222.80</span>
              <span className="font-mono text-[10px] text-accent-success font-medium">/ week</span>
            </div>
            <p className="text-[10px] text-text-dim font-mono mt-1">Based on 3 active recommendations</p>
          </div>
        </section>

        {/* Charts & Allocations Splitting Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Spend Trend (Custom Area Chart) */}
          <div className="lg:col-span-2 bg-bg-surface border border-border-muted rounded p-5 flex flex-col justify-between h-[300px]">
            <div className="flex items-center justify-between border-b border-border-muted/50 pb-3 mb-2">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                Daily Cost Progression ($)
              </h2>
              <span className="text-[9px] font-mono text-text-dim">7-Day Period</span>
            </div>
            
            {/* The Area Chart */}
            <div className="flex-1 w-full relative pt-2">
              <svg 
                viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                {/* Area Gradient */}
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-info)" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="var(--accent-info)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="0" y1="10" x2={svgWidth} y2="10" stroke="var(--border-muted)" strokeWidth="0.5" strokeDasharray="3" />
                <line x1="0" y1={svgHeight/2} x2={svgWidth} y2={svgHeight/2} stroke="var(--border-muted)" strokeWidth="0.5" strokeDasharray="3" />
                <line x1="0" y1={svgHeight-10} x2={svgWidth} y2={svgHeight-10} stroke="var(--border-muted)" strokeWidth="0.5" strokeDasharray="3" />

                {/* Filled Area */}
                <path d={areaPath} fill="url(#areaGrad)" />
                
                {/* Path Outline */}
                <path 
                  d={linePath} 
                  fill="none" 
                  stroke="var(--accent-info)" 
                  strokeWidth="1.5" 
                />

                {/* Data Points */}
                {costTrend.map((d, i) => {
                  const x = (i / (costTrend.length - 1)) * svgWidth;
                  const y = svgHeight - (d.total / maxCost) * (svgHeight - 20) - 10;
                  return (
                    <g key={i} className="group">
                      <circle 
                        cx={x} 
                        cy={y} 
                        r="3" 
                        fill="var(--bg-base)" 
                        stroke="var(--accent-info)" 
                        strokeWidth="1.5"
                        className="cursor-pointer hover:r-5 transition-all"
                      />
                      <circle 
                        cx={x} 
                        cy={y} 
                        r="8" 
                        fill="var(--accent-info)" 
                        fillOpacity="0"
                        className="cursor-pointer"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* X-Axis labels */}
            <div className="flex justify-between border-t border-border-muted/50 pt-2 text-[9px] font-mono text-text-dim">
              {costTrend.map((d, i) => (
                <span key={i}>{d.date}</span>
              ))}
            </div>
          </div>

          {/* Allocations (Denses Horizontal percentage lists) */}
          <div className="bg-bg-surface border border-border-muted rounded p-5 flex flex-col justify-between h-[300px]">
            <div className="border-b border-border-muted/50 pb-3 mb-2">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">
                Resource Breakdown
              </h2>
            </div>

            <div className="flex-1 flex flex-col justify-around py-2 space-y-4">
              {/* Models Breakdown */}
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-mono tracking-wider text-text-dim block">By Model Provider</span>
                <div className="flex h-3 rounded overflow-hidden bg-bg-base border border-border-muted">
                  <div 
                    style={{ width: `${(lastTrend.openai / totalModelCost) * 100}%` }} 
                    className="bg-accent-info" 
                    title={`OpenAI: $${lastTrend.openai}`}
                  />
                  <div 
                    style={{ width: `${(lastTrend.anthropic / totalModelCost) * 100}%` }} 
                    className="bg-accent-warning" 
                    title={`Anthropic: $${lastTrend.anthropic}`}
                  />
                  <div 
                    style={{ width: `${(lastTrend.cohere / totalModelCost) * 100}%` }} 
                    className="bg-accent-success" 
                    title={`Cohere: $${lastTrend.cohere}`}
                  />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-text-muted">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent-info" /> OpenAI ({((lastTrend.openai / totalModelCost) * 100).toFixed(0)}%)</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent-warning" /> Anthropic ({((lastTrend.anthropic / totalModelCost) * 100).toFixed(0)}%)</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent-success" /> Cohere</span>
                </div>
              </div>

              {/* Agents Allocation */}
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase font-mono tracking-wider text-text-dim block">By Active Agent</span>
                <div className="space-y-2">
                  {Object.entries(agentCosts).map(([name, cost]) => {
                    const percentage = (cost / totalAgentCost) * 100;
                    return (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-text-muted">
                          <span className="truncate max-w-[150px]">{name}</span>
                          <span>${cost.toFixed(4)} ({percentage.toFixed(0)}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-bg-base border border-border-muted rounded-full overflow-hidden">
                          <div 
                            style={{ width: `${percentage}%` }}
                            className="h-full bg-accent-info"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Recommendations Engine Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4.5 w-4.5 text-accent-success" />
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-text-primary">
              AI Recommendations Engine
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {recommendations.map((rec) => {
              const isHigh = rec.impact.includes("High");
              const isMod = rec.impact.includes("Moderate");

              return (
                <div 
                  key={rec.id} 
                  className={`bg-bg-surface border rounded p-5 flex flex-col justify-between h-[200px] transition-all hover:bg-bg-elevated/20 ${
                    isHigh ? "border-accent-success/20" : isMod ? "border-accent-warning/20" : "border-border-muted"
                  }`}
                >
                  <div className="space-y-2">
                    {/* Impact Tag */}
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                        isHigh 
                          ? "bg-accent-success/10 text-accent-success" 
                          : isMod 
                            ? "bg-accent-warning/10 text-accent-warning" 
                            : "bg-accent-info/10 text-accent-info"
                      }`}>
                        {rec.impact}
                      </span>
                      <span className="text-[9px] font-mono text-text-dim">
                        {rec.agent_name}
                      </span>
                    </div>

                    <h3 className="text-xs font-semibold text-text-primary leading-tight">
                      {rec.description}
                    </h3>
                    <p className="text-[10px] font-mono text-text-muted leading-relaxed">
                      {rec.rationale}
                    </p>
                  </div>

                  {/* Savings projection */}
                  <div className="border-t border-border-muted/50 pt-2.5 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-text-dim">Projected Savings:</span>
                    <span className="text-accent-success font-bold flex items-center gap-0.5">
                      <TrendingDown className="h-3 w-3" /> ${rec.potential_savings.toFixed(2)}/wk
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
