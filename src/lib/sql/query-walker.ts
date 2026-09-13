/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  columnsToString,
  exprToString,
  findRange,
  selectBody,
  windowSpecToString,
} from "./expr";
import {
  emptyStats,
  type VisualEdge,
  type VisualModel,
  type VisualNode,
  type VisualStats,
} from "./types";

type BuildCtx = {
  sql: string;
  nodes: VisualNode[];
  edges: VisualEdge[];
  stats: VisualStats;
  idSeq: number;
};

function nid(ctx: BuildCtx, prefix: string) {
  ctx.idSeq += 1;
  return `${prefix}-${ctx.idSeq}`;
}

function link(
  ctx: BuildCtx,
  source: string,
  target: string,
  label?: string,
  kind: VisualEdge["kind"] = "flow",
) {
  ctx.edges.push({
    id: `e-${source}-${target}-${ctx.edges.length}`,
    source,
    target,
    label,
    kind,
  });
}

function cteName(cte: any) {
  return cte.name?.value ?? cte.name ?? "CTE";
}

function tableName(fromItem: any): string {
  if (!fromItem) return "table";
  if (fromItem.table) {
    const schema = fromItem.db || fromItem.schema;
    const name = schema ? `${schema}.${fromItem.table}` : fromItem.table;
    return fromItem.as ? `${name} AS ${fromItem.as}` : name;
  }
  if (selectBody(fromItem.expr)) {
    return fromItem.as ? String(fromItem.as) : "subquery";
  }
  return "table";
}

function fromAlias(fromItem: any): string | null {
  if (!fromItem) return null;
  if (fromItem.as) return String(fromItem.as);
  if (fromItem.table) return String(fromItem.table);
  return null;
}

function summarizeInner(nodes: VisualNode[]): string {
  const parts: string[] = [];
  const joins = nodes.filter((n) => n.kind === "join").length;
  const windows = nodes.filter((n) => n.kind === "window").length;
  if (joins) parts.push(`${joins} join${joins === 1 ? "" : "s"}`);
  if (nodes.some((n) => n.kind === "where")) parts.push("WHERE");
  if (nodes.some((n) => n.kind === "groupby")) parts.push("GROUP BY");
  if (nodes.some((n) => n.kind === "having")) parts.push("HAVING");
  if (nodes.some((n) => n.kind === "qualify")) parts.push("QUALIFY");
  if (windows) parts.push(`${windows} window fn${windows === 1 ? "" : "s"}`);
  if (nodes.some((n) => n.kind === "union")) parts.push("set op");
  if (nodes.some((n) => n.kind === "subquery")) parts.push("subquery");
  return parts.join(" · ") || "SELECT body";
}

function subqueryDetail(body: any): string {
  const from = body.from?.[0]?.table ?? body.from?.[0]?.as ?? "…";
  const where = body.where ? ` WHERE ${exprToString(body.where)}` : "";
  const text = `FROM ${from}${where}`;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/** Depth-first walk of expression trees (binary, args, CASE, lists). */
function visitExpr(node: any, visit: (n: any) => void) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) visitExpr(item, visit);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === "tableList" || key === "columnList") continue;
    const child = node[key];
    if (child && typeof child === "object") visitExpr(child, visit);
  }
}

function collectWindows(root: any): { name: string; over: string }[] {
  const out: { name: string; over: string }[] = [];
  const seen = new Set<string>();
  visitExpr(root, (n) => {
    if (!n || typeof n !== "object") return;
    const isWindow =
      n.type === "window_func" || (n.type === "aggr_func" && n.over);
    if (!isWindow) return;
    const name = String(n.name ?? "WINDOW");
    const over = windowSpecToString(n.over);
    const key = `${name}|${over}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, over });
  });
  return out;
}

function collectSelectBodies(root: any): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
  visitExpr(root, (n) => {
    // Prefer wrapper nodes `{ ast: SelectAST }` so we do not re-pick the Select itself.
    if (n?.ast?.type === "select") {
      if (seen.has(n.ast)) return;
      seen.add(n.ast);
      out.push(n.ast);
    }
  });
  return out;
}

function collectTableAliases(root: any): Set<string> {
  const aliases = new Set<string>();
  visitExpr(root, (n) => {
    if (n?.type === "column_ref" && n.table) {
      aliases.add(String(n.table).toLowerCase());
    }
  });
  return aliases;
}

function isCorrelated(body: any, outerAliases: Set<string>): boolean {
  if (!outerAliases.size) return false;
  const inner = new Set<string>();
  const fromList: any[] = Array.isArray(body.from)
    ? body.from
    : body.from
      ? [body.from]
      : [];
  for (const item of fromList) {
    const a = fromAlias(item);
    if (a) inner.add(a.toLowerCase());
    if (item.table) inner.add(String(item.table).toLowerCase());
  }
  const refs = collectTableAliases(body);
  for (const ref of refs) {
    if (outerAliases.has(ref) && !inner.has(ref)) return true;
  }
  return false;
}

function pushWindow(
  ctx: BuildCtx,
  name: string,
  over: string,
  previousId?: string,
): string {
  const id = nid(ctx, "window");
  ctx.nodes.push({
    id,
    kind: "window",
    label: name,
    detail: over ? `OVER (${over})` : "OVER ()",
    sqlRange: findRange(ctx.sql, "OVER"),
  });
  if (previousId) link(ctx, previousId, id);
  return id;
}

function pushSubqueryShell(
  ctx: BuildCtx,
  label: string,
  body: any,
  previousId: string | undefined,
  correlated: boolean,
): string {
  const id = nid(ctx, "subquery");
  const detail = correlated
    ? `CORRELATED · ${subqueryDetail(body)}`
    : subqueryDetail(body);
  ctx.nodes.push({
    id,
    kind: "subquery",
    label,
    detail,
    sqlRange: findRange(ctx.sql, "SELECT"),
  });
  if (previousId) link(ctx, previousId, id);
  const before = ctx.nodes.length;
  walkSelect(ctx, body, id);
  const inner = ctx.nodes.slice(before);
  if (inner.length) {
    const shell = ctx.nodes.find((n) => n.id === id);
    if (shell) {
      shell.detail = correlated
        ? `CORRELATED · ${summarizeInner(inner)}`
        : summarizeInner(inner);
    }
  }
  return id;
}

function walkNestedSelectsInExpr(
  ctx: BuildCtx,
  expr: any,
  previousId: string | undefined,
  outerAliases: Set<string>,
): string | undefined {
  let last = previousId;
  for (const body of collectSelectBodies(expr)) {
    const correlated = isCorrelated(body, outerAliases);
    last = pushSubqueryShell(
      ctx,
      correlated ? "CORRELATED SUBQUERY" : "SUBQUERY",
      body,
      last,
      correlated,
    );
  }
  return last;
}

function walkWindowsInExpr(
  ctx: BuildCtx,
  expr: any,
  previousId?: string,
): string | undefined {
  let last = previousId;
  for (const w of collectWindows(expr)) {
    last = pushWindow(ctx, w.name, w.over, last);
  }
  return last;
}

/**
 * FROM / JOIN / WHERE / GROUP / HAVING / windows / QUALIFY / SELECT / ORDER / LIMIT
 * — one SELECT arm only. Set operations are handled by walkSelect.
 */
function walkSelectBody(
  ctx: BuildCtx,
  ast: any,
  previousId?: string,
): string {
  let last = previousId;

  if (ast.with && Array.isArray(ast.with)) {
    for (const cte of ast.with) {
      const name = cteName(cte);
      const id = nid(ctx, "cte");
      const recursive = !!cte.recursive;
      const cteNode: VisualNode = {
        id,
        kind: "cte",
        label: name,
        detail: recursive ? "RECURSIVE" : "…",
        sqlRange: findRange(ctx.sql, name),
      };
      ctx.nodes.push(cteNode);
      if (last) link(ctx, last, id);
      last = id;

      const body = selectBody(cte.stmt) ?? cte.stmt;
      if (body?.type === "select" || selectBody(body)) {
        const selectAst = body.type === "select" ? body : selectBody(body);
        const before = ctx.nodes.length;
        last = walkSelect(ctx, selectAst, last);
        const summary = summarizeInner(ctx.nodes.slice(before));
        cteNode.detail = recursive ? `RECURSIVE · ${summary}` : summary;
      } else {
        cteNode.detail = recursive ? "RECURSIVE · body not parsed" : "body not parsed";
      }
    }
  }

  const fromList: any[] = Array.isArray(ast.from)
    ? ast.from
    : ast.from
      ? [ast.from]
      : [];
  let joinAnchor = last;
  const outerAliases = new Set<string>();
  for (const item of fromList) {
    const a = fromAlias(item);
    if (a) outerAliases.add(a.toLowerCase());
  }

  fromList.forEach((item, index) => {
    if (item.join) {
      const derived = selectBody(item.expr);
      let rightId: string;
      if (derived) {
        rightId = pushSubqueryShell(
          ctx,
          item.as ? String(item.as) : "SUBQUERY",
          derived,
          undefined,
          false,
        );
      } else {
        rightId = nid(ctx, "table");
        ctx.nodes.push({
          id: rightId,
          kind: "table",
          label: tableName(item),
          detail: item.as ? `ALIAS ${item.as}` : undefined,
          sqlRange: findRange(ctx.sql, item.table ?? ""),
        });
      }

      const joinId = nid(ctx, "join");
      const onText = item.on ? exprToString(item.on) : "";
      const usingText = item.using
        ? Array.isArray(item.using)
          ? item.using.map(exprToString).join(", ")
          : exprToString(item.using)
        : "";
      const joinDetail = onText
        ? `ON ${onText}`
        : usingText
          ? `USING (${usingText})`
          : item.on
            ? "ON …"
            : undefined;
      ctx.nodes.push({
        id: joinId,
        kind: "join",
        label: String(item.join).toUpperCase(),
        detail: joinDetail,
        sqlRange: findRange(ctx.sql, String(item.join)),
      });

      if (item.on) {
        last =
          walkNestedSelectsInExpr(ctx, item.on, joinAnchor, outerAliases) ??
          joinAnchor;
        joinAnchor = last ?? joinAnchor;
      }

      if (joinAnchor) link(ctx, joinAnchor, joinId);
      link(ctx, rightId, joinId, undefined, "join");
      joinAnchor = joinId;
      last = joinId;
      return;
    }

    const derived = selectBody(item.expr);
    let id: string;
    if (derived) {
      id = pushSubqueryShell(
        ctx,
        item.as ? String(item.as) : "SUBQUERY",
        derived,
        undefined,
        false,
      );
    } else {
      id = nid(ctx, "table");
      ctx.nodes.push({
        id,
        kind: "table",
        label: tableName(item),
        detail: index === 0 ? "FROM" : undefined,
        sqlRange: findRange(ctx.sql, item.table ?? ""),
      });
    }

    if (index > 0) {
      // Comma join: FROM a, b — Cartesian product unless WHERE equates them.
      const joinId = nid(ctx, "join");
      ctx.nodes.push({
        id: joinId,
        kind: "join",
        label: "CROSS JOIN",
        detail: "Comma join — no ON clause",
        sqlRange: findRange(ctx.sql, ","),
      });
      if (joinAnchor) link(ctx, joinAnchor, joinId);
      link(ctx, id, joinId, undefined, "join");
      joinAnchor = joinId;
      last = joinId;
    } else {
      if (last) link(ctx, last, id);
      joinAnchor = id;
      last = id;
    }
  });

  if (ast.where) {
    last =
      walkNestedSelectsInExpr(ctx, ast.where, last, outerAliases) ?? last;
    const id = nid(ctx, "where");
    ctx.nodes.push({
      id,
      kind: "where",
      label: "WHERE",
      detail: exprToString(ast.where),
      sqlRange: findRange(ctx.sql, "WHERE"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  if (ast.groupby) {
    const cols = Array.isArray(ast.groupby?.columns)
      ? ast.groupby.columns
      : Array.isArray(ast.groupby)
        ? ast.groupby
        : [];
    const id = nid(ctx, "groupby");
    ctx.nodes.push({
      id,
      kind: "groupby",
      label: "GROUP BY",
      detail: cols.map((c: any) => exprToString(c)).join(", "),
      sqlRange: findRange(ctx.sql, "GROUP BY"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  if (ast.having) {
    last =
      walkNestedSelectsInExpr(ctx, ast.having, last, outerAliases) ?? last;
    const id = nid(ctx, "having");
    ctx.nodes.push({
      id,
      kind: "having",
      label: "HAVING",
      detail: exprToString(ast.having),
      sqlRange: findRange(ctx.sql, "HAVING"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  last = walkWindowsInExpr(ctx, ast.columns, last) ?? last;
  last =
    walkNestedSelectsInExpr(ctx, ast.columns, last, outerAliases) ?? last;

  if (ast.qualify) {
    last = walkWindowsInExpr(ctx, ast.qualify, last) ?? last;
    last =
      walkNestedSelectsInExpr(ctx, ast.qualify, last, outerAliases) ?? last;
    const id = nid(ctx, "qualify");
    ctx.nodes.push({
      id,
      kind: "qualify",
      label: "QUALIFY",
      detail: exprToString(ast.qualify),
      sqlRange: findRange(ctx.sql, "QUALIFY"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  // CASE expressions in the select list (non-window).
  const cols = Array.isArray(ast.columns) ? ast.columns : [];
  for (const col of cols) {
    const expr = col?.expr;
    if (!expr || expr.type !== "case") continue;
    const id = nid(ctx, "stmt");
    const detail = exprToString(expr);
    ctx.nodes.push({
      id,
      kind: "stmt",
      label: "CASE",
      detail: detail.length > 90 ? `${detail.slice(0, 87)}…` : detail,
      sqlRange: findRange(ctx.sql, "CASE"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  const selectId = nid(ctx, "select");
  ctx.nodes.push({
    id: selectId,
    kind: "select",
    label: "SELECT",
    detail: columnsToString(ast.columns),
    sqlRange: findRange(ctx.sql, "SELECT"),
  });
  if (last) link(ctx, last, selectId);
  last = selectId;

  const isDistinct =
    ast.distinct === "DISTINCT" ||
    ast.distinct?.type === "DISTINCT" ||
    (typeof ast.distinct === "object" && ast.distinct?.type != null);
  if (isDistinct) {
    const id = nid(ctx, "distinct");
    ctx.nodes.push({
      id,
      kind: "distinct",
      label: "DISTINCT",
      detail: "Removes duplicate rows from the projection",
      sqlRange: findRange(ctx.sql, "DISTINCT"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  if (ast.orderby) {
    const id = nid(ctx, "orderby");
    ctx.nodes.push({
      id,
      kind: "orderby",
      label: "ORDER BY",
      detail: (ast.orderby as any[])
        .map((o) => `${exprToString(o.expr)}${o.type ? ` ${o.type}` : ""}`)
        .join(", "),
      sqlRange: findRange(ctx.sql, "ORDER BY"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  const limitVal = ast.limit?.value ?? ast.limit;
  if (limitVal && (Array.isArray(limitVal) ? limitVal.length : limitVal)) {
    const id = nid(ctx, "limit");
    const text = Array.isArray(limitVal)
      ? limitVal.map((v: any) => v?.value ?? v).join(", ")
      : String(limitVal?.value ?? limitVal);
    ctx.nodes.push({
      id,
      kind: "limit",
      label: "LIMIT",
      detail: text,
      sqlRange: findRange(ctx.sql, "LIMIT"),
    });
    if (last) link(ctx, last, id);
    last = id;
  }

  return last ?? selectId;
}

/**
 * Walk a SELECT including left-associative set operations
 * (UNION / UNION ALL / EXCEPT / INTERSECT via `_next` + `set_op`).
 */
function walkSelect(ctx: BuildCtx, ast: any, previousId?: string): string {
  let left = walkSelectBody(ctx, ast, previousId);
  let current = ast;

  while (current._next) {
    const op = String(current.set_op || "UNION").toUpperCase();
    const right = walkSelectBody(ctx, current._next, undefined);
    const unionId = nid(ctx, "union");
    ctx.nodes.push({
      id: unionId,
      kind: "union",
      label: op,
      detail: "Combines two result sets",
      sqlRange: findRange(ctx.sql, op.split(/\s+/)[0]),
    });
    if (left) link(ctx, left, unionId);
    if (right) link(ctx, right, unionId);
    left = unionId;
    current = current._next;
  }

  return left;
}

function walkDml(ctx: BuildCtx, ast: any, previousId?: string): string {
  const type = String(ast.type || "").toLowerCase();
  const last = previousId;

  if (type === "insert") {
    const table = ast.table?.[0]?.table ?? ast.table?.table ?? "table";
    const id = nid(ctx, "insert");
    ctx.nodes.push({
      id,
      kind: "insert",
      label: `INSERT ${table}`,
      detail: ast.columns ? `COLUMNS ${ast.columns.join(", ")}` : undefined,
      sqlRange: findRange(ctx.sql, "INSERT"),
    });
    if (last) link(ctx, last, id);
    return id;
  }

  if (type === "update") {
    const table = ast.table?.[0]?.table ?? ast.table?.table ?? "table";
    const id = nid(ctx, "update");
    ctx.nodes.push({
      id,
      kind: "update",
      label: `UPDATE ${table}`,
      detail: ast.where ? `WHERE ${exprToString(ast.where)}` : undefined,
      sqlRange: findRange(ctx.sql, "UPDATE"),
    });
    if (last) link(ctx, last, id);
    return id;
  }

  if (type === "delete") {
    const table =
      ast.from?.table ??
      ast.table?.[0]?.table ??
      ast.table?.table ??
      "table";
    const id = nid(ctx, "delete");
    ctx.nodes.push({
      id,
      kind: "delete",
      label: `DELETE ${table}`,
      detail: ast.where ? `WHERE ${exprToString(ast.where)}` : undefined,
      sqlRange: findRange(ctx.sql, "DELETE"),
    });
    if (last) link(ctx, last, id);
    return id;
  }

  return last ?? previousId ?? "";
}

/** Reconcile counters from the nodes we actually drew — safer than incrementing mid-walk. */
export function statsFromNodes(nodes: VisualNode[]): VisualStats {
  return {
    tables: nodes.filter((n) => n.kind === "table").length,
    joins: nodes.filter((n) => n.kind === "join").length,
    filters: nodes.filter(
      (n) => n.kind === "where" || n.kind === "having" || n.kind === "qualify",
    ).length,
    ctes: nodes.filter((n) => n.kind === "cte").length,
    unions: nodes.filter((n) => n.kind === "union").length,
    windows: nodes.filter((n) => n.kind === "window").length,
    subqueries: nodes.filter((n) => n.kind === "subquery").length,
    statements: nodes.filter((n) =>
      ["select", "insert", "update", "delete"].includes(n.kind),
    ).length,
  };
}

export function buildQueryModel(sql: string, statements: any[]): VisualModel {
  const ctx: BuildCtx = {
    sql,
    nodes: [],
    edges: [],
    stats: emptyStats(),
    idSeq: 0,
  };

  const startId = nid(ctx, "start");
  ctx.nodes.push({ id: startId, kind: "start", label: "START" });
  let last = startId;

  for (const stmt of statements) {
    const type = String(stmt.type || "").toLowerCase();

    if (type === "select") {
      last = walkSelect(ctx, stmt, last);
    } else if (["insert", "update", "delete"].includes(type)) {
      last = walkDml(ctx, stmt, last);
    } else {
      const id = nid(ctx, "stmt");
      ctx.nodes.push({
        id,
        kind: "stmt",
        label: type.toUpperCase() || "STATEMENT",
        sqlRange: findRange(sql, type),
      });
      link(ctx, last, id);
      last = id;
    }
  }

  const resultId = nid(ctx, "result");
  ctx.nodes.push({ id: resultId, kind: "result", label: "RESULT" });
  if (last) link(ctx, last, resultId);

  return {
    kind: statements.length > 1 ? "batch" : "query",
    nodes: ctx.nodes,
    edges: ctx.edges,
    stats: statsFromNodes(ctx.nodes),
    touches: [],
    complexity: {
      score: 0,
      joins: 0,
      subqueries: 0,
      ctes: 0,
      conditions: 0,
      tables: 0,
      aggregations: 0,
      nesting: 0,
    },
  };
}
