import type { NodeKind, VisualNode } from "./types";

export type CardinalityEffect =
  | "opens"
  | "preserves"
  | "reduces"
  | "groups"
  | "widens";

export type CardinalityInfo = {
  effect: CardinalityEffect;
  /** Short label for the card badge. */
  label: string;
};

const EFFECT_STYLE: Record<
  CardinalityEffect,
  { bg: string; text: string; symbol: string }
> = {
  opens: { bg: "#077ac722", text: "#4285f4", symbol: "↗" },
  preserves: { bg: "#9d979722", text: "#c4bec4", symbol: "↔" },
  reduces: { bg: "#00a63e22", text: "#00a63e", symbol: "↘" },
  groups: { bg: "#f2a60c22", text: "#f2a60c", symbol: "⊕" },
  widens: { bg: "#ff492c22", text: "#ff492c", symbol: "⚡" },
};

/** Logical execution phase — not lexical SQL order. */
export const EXEC_PHASE: Partial<Record<NodeKind, string>> = {
  cte: "WITH",
  table: "READ",
  join: "JOIN",
  where: "FILTER",
  groupby: "GROUP",
  having: "FILTER",
  window: "WINDOW",
  subquery: "NESTED",
  qualify: "QUALIFY",
  stmt: "EXPR",
  select: "PROJECT",
  distinct: "DISTINCT",
  orderby: "SORT",
  limit: "LIMIT",
  union: "COMBINE",
  result: "OUT",
};

export function cardinalityFor(node: VisualNode): CardinalityInfo {
  switch (node.kind) {
    case "table":
    case "cte":
      return { effect: "opens", label: "Opens rows" };
    case "join": {
      const label = node.label.toUpperCase();
      const hasOn = /\b(ON|USING)\b/i.test(node.detail ?? "");
      if (label.includes("CROSS") || !hasOn) {
        return {
          effect: "widens",
          label: hasOn ? "Cross join — can fan out" : "No ON — cross join risk",
        };
      }
      if (label.includes("LEFT") || label.includes("RIGHT")) {
        return { effect: "preserves", label: "Outer join — keeps unmatched" };
      }
      return { effect: "widens", label: "Join — row count can grow" };
    }
    case "where":
      return { effect: "reduces", label: "Rows can drop" };
    case "having":
      return { effect: "reduces", label: "Groups can drop" };
    case "qualify":
      return { effect: "reduces", label: "Window rows can drop" };
    case "groupby":
      return { effect: "groups", label: "One row per group" };
    case "window":
      return { effect: "preserves", label: "Same rows + window cols" };
    case "subquery": {
      const correlated = /CORRELATED/i.test(node.detail ?? "");
      return {
        effect: "preserves",
        label: correlated ? "Correlated — per outer row" : "Nested SELECT",
      };
    }
    case "distinct":
      return { effect: "reduces", label: "Duplicates removed" };
    case "select":
      return { effect: "preserves", label: "Projects columns" };
    case "orderby":
    case "limit":
      return { effect: "preserves", label: "Order/limit only" };
    case "union":
      return { effect: "widens", label: "Stacks result sets" };
    default:
      return { effect: "preserves", label: "Passes through" };
  }
}

export function cardinalityStyle(effect: CardinalityEffect) {
  return EFFECT_STYLE[effect];
}
