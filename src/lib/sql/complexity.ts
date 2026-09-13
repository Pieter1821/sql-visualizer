import {
  emptyComplexity,
  type Complexity,
  type TableTouch,
  type VisualModel,
  type VisualNode,
} from "./types";

const SQL_KEYWORDS = new Set(
  [
    "select",
    "from",
    "where",
    "join",
    "inner",
    "left",
    "right",
    "full",
    "cross",
    "outer",
    "on",
    "and",
    "or",
    "as",
    "with",
    "recursive",
    "group",
    "order",
    "by",
    "having",
    "union",
    "all",
    "insert",
    "update",
    "delete",
    "into",
    "values",
    "set",
    "case",
    "when",
    "then",
    "else",
    "end",
    "if",
    "begin",
    "declare",
    "return",
    "exists",
    "not",
    "null",
    "in",
    "is",
    "like",
    "between",
    "over",
    "partition",
    "limit",
    "offset",
    "fetch",
    "top",
    "distinct",
    "cast",
    "convert",
  ].map((k) => k.toUpperCase()),
);

export function isSqlKeyword(name: string) {
  return SQL_KEYWORDS.has(name.replace(/[\[\]"`]/g, "").toUpperCase());
}

export function scoreComplexity(input: {
  joins: number;
  subqueries: number;
  ctes: number;
  conditions: number;
  tables: number;
  aggregations: number;
  nesting: number;
}): Complexity {
  const raw =
    input.joins * 8 +
    input.subqueries * 10 +
    input.ctes * 6 +
    input.conditions * 3 +
    input.tables * 5 +
    input.aggregations * 7 +
    input.nesting * 8;
  return {
    ...input,
    score: Math.min(100, raw),
  };
}

export function complexityFromSql(sql: string, nodes: VisualNode[]): Complexity {
  const text = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const subqueries = Math.max(
    0,
    (text.match(/\(\s*select\b/gi) ?? []).length,
  );
  const aggregations = (text.match(/\b(count|sum|avg|min|max|string_agg|group_concat)\s*\(/gi) ?? [])
    .length;
  let nesting = 0;
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") {
      depth += 1;
      nesting = Math.max(nesting, depth);
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    }
  }
  return scoreComplexity({
    joins: nodes.filter((n) => n.kind === "join").length,
    subqueries,
    ctes: nodes.filter((n) => n.kind === "cte").length,
    conditions: nodes.filter((n) => n.kind === "where" || n.kind === "having" || n.kind === "if")
      .length,
    tables: nodes.filter((n) => n.kind === "table").length,
    aggregations,
    nesting,
  });
}

export function touchesFromNodes(nodes: VisualNode[]): TableTouch[] {
  const map = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (node.kind === "table" || node.kind === "cte") {
      const name = node.label.split(/\s+AS\s+/i)[0].trim();
      if (!map.has(name)) map.set(name, new Set());
    }
    if (node.detail) {
      const cols = node.detail.match(/\b[A-Za-z_][\w]*\.[A-Za-z_][\w]*/g) ?? [];
      for (const col of cols) {
        const [table, column] = col.split(".");
        if (!map.has(table)) map.set(table, new Set());
        map.get(table)!.add(column);
      }
    }
  }
  return [...map.entries()].map(([name, columns]) => ({
    name,
    columns: [...columns],
  }));
}

export function withDerived(model: Omit<VisualModel, "touches" | "complexity"> & {
  touches?: TableTouch[];
  complexity?: Complexity;
}): VisualModel {
  const complexity = model.complexity ?? complexityFromSql("", model.nodes);
  return {
    ...model,
    touches: model.touches ?? touchesFromNodes(model.nodes),
    complexity: complexity.score ? complexity : emptyComplexity(),
  };
}
