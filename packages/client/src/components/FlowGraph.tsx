import React, { useMemo } from "react";

// ── Types ───────────────────────────────────────────────────────────

export interface FlowGraphStep {
  id: string;
  label: string;
  status: "pending" | "running" | "complete" | "error" | "blocked";
  blockedBy: string[];
}

interface PositionedNode {
  id: string;
  label: string;
  status: FlowGraphStep["status"];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PositionedEdge {
  source: string;
  target: string;
  points: Array<{ x: number; y: number }>;
  sourceStatus: FlowGraphStep["status"];
  targetStatus: FlowGraphStep["status"];
}

interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

// ── Status styling ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { border: string; fill: string; text: string }> = {
  pending:  { border: "#555",    fill: "#2a2a2a", text: "#888"    },
  running:  { border: "#eab308", fill: "#2a2800", text: "#eab308" },
  complete: { border: "#22c55e", fill: "#0a2a10", text: "#22c55e" },
  error:    { border: "#ef4444", fill: "#2a0a0a", text: "#ef4444" },
  blocked:  { border: "#f97316", fill: "#2a1a00", text: "#f97316" },
};

function getEdgeColor(sourceStatus: string, targetStatus: string): { stroke: string; animated: boolean; dashed: boolean } {
  if (sourceStatus === "complete" && targetStatus === "running") {
    return { stroke: "#eab308", animated: true, dashed: false };
  }
  if (sourceStatus === "complete" && targetStatus === "complete") {
    return { stroke: "#22c55e", animated: false, dashed: false };
  }
  if (sourceStatus === "complete") {
    return { stroke: "#666", animated: false, dashed: false };
  }
  if (targetStatus === "error") {
    return { stroke: "#ef4444", animated: false, dashed: false };
  }
  return { stroke: "#444", animated: false, dashed: true };
}

// ── Dagre layout ────────────────────────────────────────────────────

const NODE_WIDTH = 120;
const NODE_HEIGHT = 32;
const FONT_SIZE = 11;
const ARROW_SIZE = 6;

export function computeLayout(steps: FlowGraphStep[]): LayoutResult {
  // Lazy import dagre-d3-es (already bundled via mermaid)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { graphlib } = require("dagre-d3-es");
  const dagre = require("dagre-d3-es/src/dagre/index.js");

  if (steps.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const g = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 15, ranksep: 40, marginx: 16, marginy: 16 });

  const statusMap = new Map<string, FlowGraphStep["status"]>();
  for (const step of steps) {
    g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    statusMap.set(step.id, step.status);
  }

  for (const step of steps) {
    for (const dep of step.blockedBy) {
      if (statusMap.has(dep)) {
        g.setEdge(dep, step.id);
      }
    }
  }

  dagre.layout(g);

  const graphMeta = g.graph();
  const nodes: PositionedNode[] = steps.map((step) => {
    const n = g.node(step.id);
    return {
      id: step.id,
      label: step.label,
      status: step.status,
      x: n.x - NODE_WIDTH / 2,
      y: n.y - NODE_HEIGHT / 2,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const edges: PositionedEdge[] = [];
  for (const step of steps) {
    for (const dep of step.blockedBy) {
      if (statusMap.has(dep)) {
        const edgeData = g.edge(dep, step.id);
        if (edgeData) {
          edges.push({
            source: dep,
            target: step.id,
            points: edgeData.points,
            sourceStatus: statusMap.get(dep) || "pending",
            targetStatus: step.status,
          });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    width: graphMeta.width || 200,
    height: graphMeta.height || 50,
  };
}

// ── SVG edge path (cubic bezier through waypoints) ──────────────────

function buildEdgePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  if (rest.length === 1) {
    return `M${first.x},${first.y} L${rest[0].x},${rest[0].y}`;
  }
  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < rest.length; i++) {
    if (i === 0) {
      const cp1x = first.x + (rest[0].x - first.x) * 0.5;
      d += ` C${cp1x},${first.y} ${cp1x},${rest[0].y} ${rest[0].x},${rest[0].y}`;
    } else {
      const prev = rest[i - 1];
      const curr = rest[i];
      const cpx = prev.x + (curr.x - prev.x) * 0.5;
      d += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
  }
  return d;
}

// ── Component ───────────────────────────────────────────────────────

export function FlowGraph({
  steps,
  onGraphClick,
  onNodeClick,
}: {
  steps: FlowGraphStep[];
  /** Click on the SVG background (opens YAML viewer) */
  onGraphClick?: () => void;
  /** Click on a specific node */
  onNodeClick?: (stepId: string) => void;
}) {
  const layout = useMemo(() => {
    if (steps.length === 0) return null;
    return computeLayout(steps);
  }, [steps]);

  if (!layout || layout.nodes.length === 0) return null;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="flow-dag-graph"
      onClick={(e) => {
        // Only fire onGraphClick if clicking the background (not a node)
        if ((e.target as Element).tagName === "svg" || (e.target as Element).tagName === "rect" && !(e.target as Element).closest("g[data-node]")) {
          onGraphClick?.();
        }
      }}
      style={{ cursor: onGraphClick ? "pointer" : "default", maxHeight: 120 }}
    >
      <defs>
        {["#444", "#666", "#22c55e", "#eab308", "#ef4444"].map((color) => (
          <marker
            key={color}
            id={`arrow-${color.replace("#", "")}`}
            viewBox={`0 0 ${ARROW_SIZE * 2} ${ARROW_SIZE * 2}`}
            refX={ARROW_SIZE * 2 - 1}
            refY={ARROW_SIZE}
            markerWidth={ARROW_SIZE}
            markerHeight={ARROW_SIZE}
            orient="auto-start-reverse"
          >
            <path d={`M0,0 L${ARROW_SIZE * 2},${ARROW_SIZE} L0,${ARROW_SIZE * 2} Z`} fill={color} />
          </marker>
        ))}
      </defs>

      {/* Edges */}
      {layout.edges.map((edge, i) => {
        const { stroke, animated, dashed } = getEdgeColor(edge.sourceStatus, edge.targetStatus);
        return (
          <path
            key={`edge-${i}`}
            d={buildEdgePath(edge.points)}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray={dashed ? "4 3" : animated ? "6 3" : "none"}
            markerEnd={`url(#arrow-${stroke.replace("#", "")})`}
            className={animated ? "flow-edge-animated" : ""}
          />
        );
      })}

      {/* Nodes — name only, status via border color */}
      {layout.nodes.map((node) => {
        const style = STATUS_COLORS[node.status] || STATUS_COLORS.pending;
        const isRunning = node.status === "running";
        // Shrink font to fit: available width = node width - left/right padding
        const availW = node.width - 16;
        const naturalW = node.label.length * FONT_SIZE * 0.6;
        const labelFontSize = naturalW > availW
          ? Math.max(7, FONT_SIZE * (availW / naturalW))
          : FONT_SIZE;

        return (
          <g
            key={node.id}
            data-node={node.id}
            onClick={(e) => { e.stopPropagation(); onGraphClick?.(); }}
            style={{ cursor: onGraphClick ? "pointer" : "default" }}
            className={isRunning ? "flow-node-running" : ""}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={5}
              ry={5}
              fill={style.fill}
              stroke={style.border}
              strokeWidth={1.5}
            />
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2 + 1}
              fontSize={labelFontSize}
              fill={style.text}
              dominantBaseline="middle"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
