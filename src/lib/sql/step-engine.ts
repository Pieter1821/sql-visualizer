import { playableNodesInOrder } from "./node-order";
import type { NodeKind, SqlRange, VisualModel, VisualNode } from "./types";

export type TransformKind =
  | "cte"
  | "from"
  | "join"
  | "where"
  | "groupby"
  | "having"
  | "select"
  | "orderby"
  | "write"
  | "other";

/**
 * How an operator can change the number of rows. This is a property of the
 * operator itself, not a measurement — nothing here is executed or estimated.
 */
export type Cardinality = "opens" | "reduces" | "preserves" | "groups" | "expands";

export type RelationShape = {
  label: string;
  columns: string[];
  note?: string;
};

export type WhyBlock = {
  headline: string;
  bullets: string[];
  reference?: string;
};

export type StepFrame = {
  id: string;
  index: number;
  kind: TransformKind;
  title: string;
  sqlSnippet: string;
  sqlRange?: SqlRange;
  nodeId: string;
  /** Upstream operators feeding this one, from the parsed edge list. */
  inputs: RelationShape[];
  output: RelationShape;
  predicate?: string;
  cardinality: Cardinality;
  why: WhyBlock;
};

const KIND_MAP: Partial<Record<NodeKind, TransformKind>> = {
  cte: "cte",
  table: "from",
  join: "join",
  where: "where",
  groupby: "groupby",
  having: "having",
  qualify: "having",
  window: "select",
  subquery: "select",
  select: "select",
  distinct: "select",
  limit: "select",
  orderby: "orderby",
  union: "other",
  insert: "write",
  update: "write",
  delete: "write",
  stmt: "other",
  if: "other",
  param: "other",
  column: "select",
  result: "select",
};

const CARDINALITY: Record<TransformKind, Cardinality> = {
  cte: "opens",
  from: "opens",
  join: "expands",
  where: "reduces",
  groupby: "groups",
  having: "reduces",
  select: "preserves",
  orderby: "preserves",
  write: "preserves",
  other: "preserves",
};

export const CARDINALITY_COPY: Record<Cardinality, string> = {
  opens: "Opens a row set",
  reduces: "Row count can only go down",
  preserves: "Row count is unchanged",
  groups: "Rows collapse into groups",
  expands: "Row count can go up or down",
};

/** Strips an alias so `Orders AS o` matches the `Orders` entry in touches. */
export function baseName(label: string) {
  return label.split(/\s+AS\s+/i)[0].trim().replace(/^\[|\]$/g, "");
}

function columnsFor(model: VisualModel, label: string): string[] {
  const name = baseName(label).toLowerCase();
  const touch = model.touches.find((t) => baseName(t.name).toLowerCase() === name);
  const cols = (touch?.columns ?? []).map((c) => c.split(".").pop() ?? c);
  return [...new Set(cols.filter(Boolean))];
}

function snippet(sql: string, range?: SqlRange, fallback = ""): string {
  if (!range) return fallback;
  const raw = sql.slice(range.start, range.end).trim();
  return raw || fallback;
}

function whyFor(kind: TransformKind, node: VisualNode, inputs: RelationShape[]): WhyBlock {
  const joinText = node.label.toUpperCase();
  const names = inputs.map((i) => i.label).join(" and ");

  switch (kind) {
    case "where":
      return {
        headline: "WHERE filters individual rows, before any grouping.",
        bullets: [
          "A row survives only if the predicate evaluates to TRUE.",
          "NULL comparisons are UNKNOWN, not TRUE, so those rows drop too.",
          "It runs before GROUP BY, so it cannot see aggregates.",
        ],
        reference: node.detail,
      };
    case "join":
      return {
        headline: `${node.label} pairs rows from ${names || "two inputs"}.`,
        bullets: [
          joinText.includes("LEFT")
            ? "Every left row survives; unmatched ones get NULLs on the right."
            : joinText.includes("RIGHT")
              ? "Every right row survives; unmatched ones get NULLs on the left."
              : joinText.includes("FULL")
                ? "Unmatched rows from both sides survive with NULLs opposite."
                : "Only matching pairs survive.",
          "One left row matching many right rows produces many output rows.",
        ],
        reference: node.detail,
      };
    case "groupby":
      return {
        headline: "GROUP BY collapses rows that share the same key.",
        bullets: [
          "One output row per distinct key combination.",
          "After this point only grouping keys and aggregates are addressable.",
        ],
        reference: node.detail,
      };
    case "having":
      return {
        headline: "HAVING filters groups, after aggregation.",
        bullets: [
          "It can reference aggregates; WHERE cannot.",
          "Filtering here happens too late to reduce the work GROUP BY already did.",
        ],
        reference: node.detail,
      };
    case "select":
      return {
        headline: "SELECT projects the columns that leave this stage.",
        bullets: [
          "Column list and expressions are resolved here.",
          "Aliases defined here are not visible to WHERE or GROUP BY.",
        ],
        reference: node.detail,
      };
    case "orderby":
      return {
        headline: "ORDER BY sorts the result. It never adds or drops rows.",
        bullets: [
          "Runs last, after SELECT, so it can use SELECT aliases.",
          "Without it the row order is not guaranteed, whatever you observed.",
        ],
        reference: node.detail,
      };
    case "from":
      return {
        headline: `FROM opens ${baseName(node.label)} as the base row set.`,
        bullets: ["Everything downstream is derived from this relation."],
        reference: node.detail,
      };
    case "cte":
      return {
        headline: `${baseName(node.label)} is a named subquery in this statement.`,
        bullets: [
          "It is a name, not a temp table — the optimiser may inline or re-evaluate it.",
          "Referencing it twice does not guarantee it is materialised once.",
        ],
        reference: node.detail,
      };
    case "write":
      return {
        headline: `${node.label} changes data.`,
        bullets: ["Nothing is executed here. This view is read-only."],
        reference: node.detail,
      };
    default:
      return {
        headline: node.label,
        bullets: ["A stage the parser found in this statement."],
        reference: node.detail,
      };
  }
}

/**
 * Builds a scrubbable timeline of the statement's logical stages. Every field
 * comes from the parsed SQL — there are no sample rows and no row counts.
 */
export function buildStepTimeline(model: VisualModel, sql: string): StepFrame[] {
  const nodes = playableNodesInOrder(model);
  if (!nodes.length) return [];

  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  return nodes.map((node, index) => {
    const kind = KIND_MAP[node.kind] ?? "other";

    const inputs: RelationShape[] = model.edges
      .filter((e) => e.target === node.id)
      .map((e) => byId.get(e.source))
      .filter((n): n is VisualNode => !!n && n.kind !== "start")
      .map((n) => ({
        label: n.label,
        columns: columnsFor(model, n.label),
        note: n.kind,
      }));

    return {
      id: node.id,
      index,
      kind,
      title: node.label,
      sqlSnippet: snippet(sql, node.sqlRange, node.detail ?? node.label),
      sqlRange: node.sqlRange,
      nodeId: node.id,
      inputs,
      output: {
        label: node.label,
        columns: columnsFor(model, node.label),
        note: node.kind,
      },
      predicate: node.detail,
      cardinality: CARDINALITY[kind],
      why: whyFor(kind, node, inputs),
    };
  });
}

export const PLAY_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
export type PlaySpeed = (typeof PLAY_SPEEDS)[number];

/** Base dwell per step at 1x — deliberately slow enough to read. */
export function stepDurationMs(speed: PlaySpeed) {
  return Math.round(2200 / speed);
}
