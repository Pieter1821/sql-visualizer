export type NodeKind =
  | "start"
  | "param"
  | "cte"
  | "table"
  | "join"
  | "where"
  | "groupby"
  | "orderby"
  | "having"
  | "select"
  | "distinct"
  | "limit"
  | "insert"
  | "update"
  | "delete"
  | "union"
  | "if"
  | "stmt"
  | "window"
  | "subquery"
  | "qualify"
  | "column"
  | "result"
  | "end";

export type SqlRange = {
  start: number;
  end: number;
};

export type VisualNode = {
  id: string;
  kind: NodeKind;
  label: string;
  detail?: string;
  sqlRange?: SqlRange;
};

export type VisualEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: "flow" | "yes" | "no" | "join";
};

export type VisualStats = {
  tables: number;
  joins: number;
  filters: number;
  statements: number;
  ctes: number;
  unions: number;
  windows: number;
  subqueries: number;
};

export type TableTouch = {
  name: string;
  columns: string[];
};

export type Complexity = {
  score: number;
  joins: number;
  subqueries: number;
  ctes: number;
  conditions: number;
  tables: number;
  aggregations: number;
  nesting: number;
};

export type VisualModel = {
  kind: "query" | "procedure" | "batch" | "empty" | "heuristic";
  nodes: VisualNode[];
  edges: VisualEdge[];
  stats: VisualStats;
  touches: TableTouch[];
  complexity: Complexity;
  dialectUsed?: string;
  warning?: string;
  error?: {
    message: string;
    line?: number;
  };
};

export const emptyStats = (): VisualStats => ({
  tables: 0,
  joins: 0,
  filters: 0,
  statements: 0,
  ctes: 0,
  unions: 0,
  windows: 0,
  subqueries: 0,
});

export const emptyComplexity = (): Complexity => ({
  score: 0,
  joins: 0,
  subqueries: 0,
  ctes: 0,
  conditions: 0,
  tables: 0,
  aggregations: 0,
  nesting: 0,
});

export function emptyModel(): VisualModel {
  return {
    kind: "empty",
    nodes: [],
    edges: [],
    stats: emptyStats(),
    touches: [],
    complexity: emptyComplexity(),
  };
}
