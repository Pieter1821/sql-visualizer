import { analyzeFindings } from "./findings";
import type { NodeKind, VisualModel, VisualNode } from "./types";

export type NodeExplain = {
  title: string;
  simple: string;
  developer: string;
  inputs?: string[];
  condition?: string;
};

export type Finding = {
  tone: "note" | "watch" | "ok";
  text: string;
};

export type ScoreCard = {
  label: string;
  value: number;
};

export type PipelineStage = {
  id: string;
  label: string;
  present: boolean;
  nodeId?: string;
};

const SIMPLE: Partial<Record<NodeKind, string>> = {
  table: "Reads rows from this table.",
  cte: "Uses the rows produced by this named query.",
  join: "Matches and combines rows from two inputs.",
  where: "Keeps only rows that match this condition.",
  having: "Keeps only groups that match this condition.",
  groupby: "Groups rows with the same key for aggregation.",
  orderby: "Sorts the rows without filtering them.",
  select: "Chooses the columns and expressions to return.",
  distinct: "Removes duplicate rows.",
  limit: "Returns no more than the requested number of rows.",
  insert: "Writes new rows.",
  update: "Changes existing rows.",
  delete: "Removes rows.",
  union: "Combines rows from two result sets; UNION ALL keeps duplicates.",
  if: "Runs one branch based on a condition.",
  param: "Supplies a value when the procedure is called.",
  start: "Starts the SQL flow.",
  end: "Ends the SQL flow.",
  result: "Shows the rows produced by the statement.",
  stmt: "Runs this statement in the batch or procedure.",
  window: "Calculates a value across related rows without removing rows.",
  subquery: "Uses the result of a nested SELECT.",
  qualify: "Keeps rows that match a condition based on window results.",
  column: "References this column in the SQL.",
};

export function explainNode(node: VisualNode, model: VisualModel): NodeExplain {
  const incoming = model.edges
    .filter((e) => e.target === node.id)
    .map((e) => model.nodes.find((n) => n.id === e.source)?.label)
    .filter(Boolean) as string[];

  const joinKind = node.label.toUpperCase();
  const leftKeep = joinKind.includes("LEFT");
  const inner = joinKind.includes("INNER") || joinKind === "JOIN";

  let developer = node.detail ?? node.label;
  if (node.kind === "join") {
    developer = leftKeep
      ? `Keeps every row from the left input. ${node.detail ?? ""}`.trim()
      : inner
        ? `Keeps only matching pairs. ${node.detail ?? ""}`.trim()
        : developer;
  }

  return {
    title: node.label,
    simple: SIMPLE[node.kind] ?? "A step extracted from the SQL you pasted.",
    developer,
    inputs: incoming.length ? incoming : undefined,
    condition: node.detail,
  };
}

export function pipelineFromModel(model: VisualModel, sql = ""): PipelineStage[] {
  const find = (kinds: NodeKind[]) => model.nodes.find((n) => kinds.includes(n.kind));
  const text = sql.toLowerCase();
  const stages: Array<[string, string, NodeKind[], RegExp?]> = [
    ["from", "FROM", ["table", "cte"], /\bfrom\b/],
    ["join", "JOIN", ["join"], /\bjoin\b/],
    ["where", "WHERE", ["where"], /\bwhere\b/],
    ["group", "GROUP BY", ["groupby"], /\bgroup\s+by\b/],
    ["having", "HAVING", ["having"], /\bhaving\b/],
    ["select", "SELECT", ["select"], /\bselect\b/],
    ["order", "ORDER BY", ["orderby"], /\border\s+by\b/],
    ["write", "WRITE", ["insert", "update", "delete"], /\b(insert|update|delete)\b/],
    ["result", "RESULT", ["result"]],
  ];
  return stages.map(([id, label, kinds, re]) => {
    const node = find(kinds);
    const present = !!node || !!(re && re.test(text));
    return { id, label, present, nodeId: node?.id };
  });
}

export function scoreCards(sql: string, model: VisualModel): ScoreCard[] {
  const c = model.complexity;
  const text = sql.toLowerCase();
  const lines = sql.split(/\n/).length;
  const readability = clamp(
    100 - c.nesting * 8 - Math.max(0, lines - 40) - (text.includes("select *") ? 8 : 0),
  );
  const joinScore = clamp(c.joins * 16 + (/\bleft\s+join\b/i.test(sql) ? 8 : 0));
  const nested = clamp(c.subqueries * 12 + c.nesting * 6);
  return [
    { label: "Complexity", value: c.score },
    { label: "Readability", value: readability },
    { label: "Join density", value: joinScore },
    { label: "Nested logic", value: nested },
  ];
}

export function staticFindings(sql: string, model: VisualModel): Finding[] {
  return analyzeFindings(sql, model);
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function nodeAtOffset(nodes: VisualNode[], offset: number): VisualNode | null {
  const hits = nodes.filter(
    (n) => n.sqlRange && offset >= n.sqlRange.start && offset <= n.sqlRange.end,
  );
  if (!hits.length) return null;
  return hits.sort(
    (a, b) =>
      (a.sqlRange!.end - a.sqlRange!.start) - (b.sqlRange!.end - b.sqlRange!.start),
  )[0];
}
