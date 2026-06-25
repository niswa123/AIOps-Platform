"use client";

import { useMemo, useState } from "react";
import { Trace, TelemetrySpan } from "@/lib/mockData";
import { 
  Play, 
  Hammer, 
  Cpu, 
  HelpCircle,
  Clock,
  ArrowRight
} from "lucide-react";

interface WorkflowDAGProps {
  trace: Trace;
}

interface GraphNode {
  id: string;
  span: TelemetrySpan;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function WorkflowDAG({ trace }: WorkflowDAGProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const containerHeight = 360;
  const nodeWidth = 170;
  const nodeHeight = 56;

  // Build DAG node coordinates dynamically using layout algorithm
  const graph = useMemo(() => {
    const nodes: Record<string, GraphNode> = {};
    const levels: Record<number, string[]> = {};

    // 1. Calculate depth for each span
    const spanMap = new Map<string, TelemetrySpan>();
    trace.spans.forEach(s => spanMap.set(s.span_id, s));

    const getDepth = (spanId: string): number => {
      const span = spanMap.get(spanId);
      if (!span || !span.parent_span_id) return 0;
      return 1 + getDepth(span.parent_span_id);
    };

    trace.spans.forEach(span => {
      const depth = getDepth(span.span_id);
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(span.span_id);
    });

    // 2. Position nodes based on level groupings
    const totalLevels = Object.keys(levels).length;
    const horizontalSpacing = 240;

    Object.entries(levels).forEach(([depthStr, spanIds]) => {
      const depth = parseInt(depthStr);
      const count = spanIds.length;
      const x = 30 + depth * horizontalSpacing;

      spanIds.forEach((spanId, index) => {
        const span = spanMap.get(spanId)!;
        // Equal vertical distribution
        const y = (index + 1) * (containerHeight / (count + 1)) - (nodeHeight / 2);
        
        nodes[spanId] = {
          id: spanId,
          span,
          x,
          y,
          width: nodeWidth,
          height: nodeHeight
        };
      });
    });

    // 3. Build edges
    const edges: { from: GraphNode; to: GraphNode }[] = [];
    trace.spans.forEach(span => {
      if (span.parent_span_id && nodes[span.parent_span_id] && nodes[span.span_id]) {
        edges.push({
          from: nodes[span.parent_span_id],
          to: nodes[span.span_id]
        });
      }
    });

    return { nodes: Object.values(nodes), edges };
  }, [trace]);

  const getIcon = (type: string) => {
    switch (type) {
      case "agent_run":
        return <Play className="h-3 w-3 text-accent-success shrink-0" />;
      case "tool_call":
        return <Hammer className="h-3 w-3 text-accent-warning shrink-0" />;
      case "llm_call":
        return <Cpu className="h-3 w-3 text-accent-info shrink-0" />;
      default:
        return <HelpCircle className="h-3 w-3 text-text-muted shrink-0" />;
    }
  };

  const getNodeBorder = (span: TelemetrySpan) => {
    if (span.status === "error") return "border-accent-error hover:border-accent-error/80 shadow-[0_0_10px_rgba(239,68,68,0.15)]";
    switch (span.span_type) {
      case "agent_run":
        return "border-accent-success/40 hover:border-accent-success";
      case "tool_call":
        return "border-accent-warning/40 hover:border-accent-warning";
      case "llm_call":
        return "border-accent-info/40 hover:border-accent-info";
      default:
        return "border-border-muted hover:border-text-dim";
    }
  };

  return (
    <div className="relative border border-border-muted bg-bg-surface rounded p-4 h-[380px] overflow-hidden select-none">
      {/* Background SVG Canvas for connecting paths */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          {/* Gradients and markers for paths */}
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="oklch(26% 0.012 240)" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="oklch(74% 0.13 220)" />
          </marker>
        </defs>

        {graph.edges.map((edge, index) => {
          const startX = edge.from.x + edge.from.width;
          const startY = edge.from.y + edge.from.height / 2;
          const endX = edge.to.x;
          const endY = edge.to.y + edge.to.height / 2;
          
          // Cubic Bezier curve calculation
          const controlOffset = 60;
          const pathD = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
          
          const isEdgeActive = hoveredNodeId === edge.from.id || hoveredNodeId === edge.to.id;

          return (
            <g key={index}>
              {/* Thick shadow path */}
              <path
                d={pathD}
                fill="none"
                stroke={isEdgeActive ? "oklch(74% 0.13 220 / 0.15)" : "transparent"}
                strokeWidth="6"
                className="transition-all duration-300"
              />
              {/* Primary connector line */}
              <path
                d={pathD}
                fill="none"
                stroke={isEdgeActive ? "var(--accent-info)" : "var(--border-muted)"}
                strokeWidth={isEdgeActive ? "1.5" : "1"}
                markerEnd={isEdgeActive ? "url(#arrow-active)" : "url(#arrow)"}
                className="transition-all duration-300"
              />
            </g>
          );
        })}
      </svg>

      {/* Nodes Layer */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        {graph.nodes.map((node) => (
          <div
            key={node.id}
            style={{
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              height: `${node.height}px`
            }}
            onMouseEnter={() => setHoveredNodeId(node.id)}
            onMouseLeave={() => setHoveredNodeId(null)}
            className={`absolute flex flex-col justify-between p-2 bg-bg-base border rounded pointer-events-auto transition-all duration-200 cursor-help ${getNodeBorder(node.span)}`}
          >
            {/* Title / Icon */}
            <div className="flex items-center gap-1.5 min-w-0">
              {getIcon(node.span.span_type)}
              <span className="font-mono text-[10px] font-semibold text-text-primary truncate flex-1 leading-none">
                {node.span.name}
              </span>
            </div>

            {/* Sub-stats footer */}
            <div className="flex items-center justify-between text-[9px] font-mono text-text-dim">
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5 shrink-0" /> {node.span.latency_ms}ms
              </span>
              {node.span.cost && node.span.cost > 0 ? (
                <span className="text-accent-success font-medium">
                  ${node.span.cost.toFixed(5)}
                </span>
              ) : (
                <span className="uppercase text-[8px]">{node.span.span_type.replace("_call", "")}</span>
              )}
            </div>

            {/* Hover Node Tooltip Info (No-Modal strategy) */}
            {hoveredNodeId === node.id && (
              <div 
                className="absolute z-10 w-64 bg-bg-elevated border border-border-muted rounded p-3 text-[10px] font-mono text-text-muted space-y-1.5 shadow-xl pointer-events-none transition-all"
                style={{
                  top: node.y + nodeHeight + 8 > containerHeight - 120 ? -120 : nodeHeight + 6,
                  left: 0
                }}
              >
                <div className="flex items-center justify-between border-b border-border-muted/50 pb-1">
                  <span className="text-[9px] uppercase tracking-wider text-text-dim">Span Metadata</span>
                  <span className={node.span.status === "success" ? "text-accent-success" : "text-accent-error"}>
                    {node.span.status.toUpperCase()}
                  </span>
                </div>
                {node.span.model && (
                  <div className="flex justify-between">
                    <span className="text-text-dim">Model:</span>
                    <span className="text-text-primary">{node.span.model}</span>
                  </div>
                )}
                {node.span.total_tokens !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-text-dim">Tokens:</span>
                    <span>{node.span.total_tokens}t</span>
                  </div>
                )}
                {node.span.metadata && Object.keys(node.span.metadata).length > 0 && (
                  <div className="border-t border-border-muted/30 pt-1 mt-1">
                    <span className="text-text-dim block mb-0.5">Context:</span>
                    <span className="text-text-primary block truncate max-w-full">
                      {JSON.stringify(node.span.metadata)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Graph Legend Overlay */}
      <div className="absolute bottom-3 right-3 bg-bg-base/80 border border-border-muted rounded px-2.5 py-1 text-[9px] font-mono text-text-dim flex gap-3 pointer-events-none backdrop-blur-sm">
        <span className="flex items-center gap-1"><ArrowRight className="h-2.5 w-2.5 text-border-muted" /> Hops / Handoffs</span>
      </div>
    </div>
  );
}
