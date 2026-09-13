import { MarkerType, type BuiltInEdge, type Edge, type Node } from "@xyflow/react";
import {
  cardinalityFor,
  EXEC_PHASE,
} from "./cardinality";
import { explainNode } from "./explain";
import { playableNodesInOrder } from "./node-order";
import type { VisualEdge, VisualModel, VisualNode } from "./types";

export const NODE_WIDTH = 380;
/** Layout spacing only — cards grow with wrapped text (no overflow clip). */
export const NODE_HEIGHT = 360;
const COL_GAP = 140;
const ROW_GAP = 160;
const STACK_GAP = 48;

export const EDGE_COLOR: Record<NonNullable<VisualEdge["kind"]> | "flow", string> = {
  flow: "#077ac7",
  yes: "#00a63e",
  no: "#ff492c",
  join: "#b26bf5",
};

function colorOf(kind: VisualEdge["kind"]) {
  return EDGE_COLOR[kind ?? "flow"] ?? EDGE_COLOR.flow;
}

/**
 * The walker emits nodes in logical execution order. One node per column keeps
 * the serpentine layout aligned with FROM → … → ORDER BY, not lexical SQL.
 */
function pipelineRanks(nodes: VisualNode[]): VisualNode[][] {
  return nodes
    .filter((n) => n.kind !== "start" && n.kind !== "end")
    .map((n) => [n]);
}

type Placement = {
  pos: Map<string, { x: number; y: number; row: number; col: number }>;
  width: number;
  height: number;
};

const stackHeight = (count: number) =>
  count * NODE_HEIGHT + (count - 1) * STACK_GAP;

/**
 * Left-to-right, then wrap to the next row — never serpentine reverse.
 * Zigzag reading order is what makes dense pipelines feel like spaghetti.
 */
function place(ranks: VisualNode[][], cols: number): Placement {
  const rows = Math.ceil(ranks.length / cols);
  const rowHeights = Array.from({ length: rows }, (_, row) => {
    const inRow = ranks.slice(row * cols, row * cols + cols);
    return stackHeight(Math.max(1, ...inRow.map((r) => r.length)));
  });
  const rowTops = rowHeights.reduce<number[]>((acc, h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + rowHeights[i - 1] + ROW_GAP);
    return acc;
  }, []);

  const pos = new Map<string, { x: number; y: number; row: number; col: number }>();
  ranks.forEach((rank, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = col * (NODE_WIDTH + COL_GAP);
    const top = rowTops[row] + (rowHeights[row] - stackHeight(rank.length)) / 2;
    rank.forEach((n, k) => {
      pos.set(n.id, { x, y: top + k * (NODE_HEIGHT + STACK_GAP), row, col });
    });
  });

  const usedCols = Math.min(cols, ranks.length);
  return {
    pos,
    width: usedCols * NODE_WIDTH + (usedCols - 1) * COL_GAP,
    height: rowHeights.reduce((a, b) => a + b, 0) + (rows - 1) * ROW_GAP,
  };
}

/**
 * Prefer a short, readable strip (max 3 columns) over packing every card into
 * the viewport. Zoom can always be adjusted; a 5×5 grid cannot be followed.
 */
function bestColumns(ranks: VisualNode[][], pane: { width: number; height: number }) {
  if (ranks.length <= 1) return 1;
  if (!pane.width || !pane.height) return Math.min(3, ranks.length);

  const maxCols = Math.min(3, ranks.length);
  let best = 1;
  let bestScore = -1;
  for (let cols = 1; cols <= maxCols; cols += 1) {
    const { width, height } = place(ranks, cols);
    const zoom = Math.min(pane.width / width, pane.height / height, 1);
    // Slight preference for 2–3 columns so long pipelines still scroll rather
    // than collapse into an unreadable mosaic.
    const score = zoom * (cols === 1 ? 0.92 : 1);
    if (score > bestScore + 0.01) {
      bestScore = score;
      best = cols;
    }
  }
  return best;
}

function metaFor(node: VisualNode, model: VisualModel): string | undefined {
  switch (node.kind) {
    case "table":
    case "cte": {
      const name = node.label.split(/\s+AS\s+/i)[0].trim().replace(/^\[|\]$/g, "");
      const touch = model.touches.find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );
      const count = touch?.columns.length ?? 0;
      if (!count) return undefined;
      return `${count} column${count === 1 ? "" : "s"} named in this SQL`;
    }
    case "join":
      return "Row count can grow here — read the ON clause";
    case "where":
      return "Rows that fail this test disappear";
    case "having":
      return "Groups that fail this test disappear";
    case "qualify":
      return "Keeps rows that pass the window predicate";
    case "groupby":
      return "Collapses to one row per distinct key";
    case "orderby":
      return "Sorts only — does not filter";
    case "select":
      return "Defines what leaves this stage";
    case "distinct":
      return "Duplicate rows removed here";
    case "limit":
      return "Hard cap on rows returned";
    case "insert":
    case "update":
    case "delete":
      return "Changes data — nothing runs in this app";
    case "if":
      return "Only one branch runs per call";
    case "param":
      return "Supplied when the procedure is called";
    case "union":
      return "Stacks two result sets";
    case "window":
      return "Partitioned calculation — rows are not removed";
    case "subquery":
      return "Nested read — may run once or per outer row";
    default:
      return undefined;
  }
}

/** Splits a column list on top-level commas so function args stay together. */
function splitColumns(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | null = null;

  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function formatDetail(node: VisualNode): string | undefined {
  if (!node.detail) return undefined;
  const text = node.detail.trim();

  if (node.kind === "table") {
    if (/^FROM$/i.test(text)) return `FROM ${node.label}`;
    if (/^ALIAS\b/i.test(text)) return `JOIN ${node.label}`;
  }

  if (node.kind === "select") {
    const cols = splitColumns(text);
    if (cols.length <= 3) return cols.join(", ");
    return `${cols.length} columns · ${cols.slice(0, 3).join(", ")} (+${cols.length - 3} more)`;
  }

  if (text.length > 88) return `${text.slice(0, 85)}…`;
  return text;
}

function hintFor(node: VisualNode, model: VisualModel): string {
  return explainNode(node, model).simple;
}

function handlesFor(
  from: { row: number; col: number },
  to: { row: number; col: number },
) {
  if (from.row === to.row) {
    return to.col >= from.col
      ? { sourceHandle: "out-right", targetHandle: "in-left" }
      : { sourceHandle: "out-left", targetHandle: "in-right" };
  }
  return { sourceHandle: "out-bottom", targetHandle: "in-top" };
}

function build(
  modelNodes: VisualNode[],
  modelEdges: VisualEdge[],
  model: VisualModel,
  pane: { width: number; height: number },
): { nodes: Node[]; edges: Edge[] } {
  if (!modelNodes.length) return { nodes: [], edges: [] };

  const ranks = pipelineRanks(modelNodes);
  const { pos } = place(ranks, bestColumns(ranks, pane));

  const order = new Map(
    playableNodesInOrder(model).map((node, index) => [node.id, index + 1]),
  );

  const nodes: Node[] = modelNodes.map((n) => {
    const at = pos.get(n.id);
    const detail = formatDetail(n);
    return {
      id: n.id,
      type: "sqlNode",
      position: { x: at?.x ?? 0, y: at?.y ?? 0 },
      data: {
        kind: n.kind,
        label: n.label,
        detail,
        sqlRange: n.sqlRange,
        step: order.get(n.id),
        phase: EXEC_PHASE[n.kind],
        cardinality: cardinalityFor(n),
        hint: hintFor(n, model),
        meta: metaFor(n, model),
      },
    };
  });

  const edges: Edge[] = modelEdges.map((e) => {
    const stroke = colorOf(e.kind);
    const from = pos.get(e.source);
    const to = pos.get(e.target);
    const ends =
      from && to
        ? handlesFor(from, to)
        : { sourceHandle: "out-bottom", targetHandle: "in-top" };
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      ...ends,
      label: e.label,
      type: "smoothstep",
      pathOptions: { borderRadius: 24 },
      style: { stroke, strokeWidth: 2.4 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 22,
        height: 22,
        color: stroke,
      },
      labelShowBg: true,
      labelStyle: { fill: "#f4f4f4", fontSize: 13, fontWeight: 500 },
      labelBgStyle: { fill: "#100d17", stroke, strokeWidth: 1, fillOpacity: 0.95 },
      labelBgPadding: [9, 6] as [number, number],
      labelBgBorderRadius: 999,
      data: { kind: e.kind ?? "flow", stroke },
    } satisfies BuiltInEdge;
  });

  return { nodes, edges };
}

export function toFlowElements(
  model: VisualModel,
  pane: { width: number; height: number },
) {
  // START/END are ceremony: whole levels that say nothing about the query.
  const drop = new Set(
    model.nodes.filter((n) => n.kind === "start" || n.kind === "end").map((n) => n.id),
  );
  const nodes = model.nodes.filter((n) => !drop.has(n.id));
  if (!nodes.length) return build(model.nodes, model.edges, model, pane);

  const playable = playableNodesInOrder(model);
  const playableIds = new Set(playable.map((node) => node.id));
  const orderedNodes = [
    ...playable,
    ...nodes.filter((node) => !playableIds.has(node.id)),
  ];
  const edges = model.edges.filter(
    (e) => !drop.has(e.source) && !drop.has(e.target),
  );
  return build(orderedNodes, edges, model, pane);
}
