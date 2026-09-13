/* eslint-disable @typescript-eslint/no-explicit-any */

function ident(value: any): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(ident).filter(Boolean).join(".");
  if (typeof value === "object") {
    if (typeof value.column === "string") return value.column;
    if (typeof value.value === "string" || typeof value.value === "number") {
      return String(value.value);
    }
    if (value.expr) return ident(value.expr);
    if (value.name) return ident(value.name);
  }
  return "";
}

export function exprToString(node: any): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);

  if (Array.isArray(node)) {
    return node.map(exprToString).filter(Boolean).join(", ");
  }

  switch (node.type) {
    case "column_ref":
      return [ident(node.table), ident(node.column)].filter(Boolean).join(".");
    case "binary_expr":
      return `${exprToString(node.left)} ${node.operator} ${exprToString(node.right)}`;
    case "unary_expr":
      return `${node.operator} ${exprToString(node.expr)}`;
    case "window_func": {
      const over = windowSpecToString(node.over);
      return over ? `${node.name ?? "WIN"}() OVER (${over})` : `${node.name ?? "WIN"}()`;
    }
    case "function":
    case "aggr_func": {
      const name = node.name?.name?.[0]?.value ?? node.name ?? "FN";
      const args = node.args?.value
        ? exprToString(node.args.value)
        : node.args?.expr
          ? exprToString(node.args.expr)
          : node.args
            ? exprToString(node.args)
            : "";
      const fn = `${name}(${args})`;
      const over = node.over ? windowSpecToString(node.over) : "";
      return over ? `${fn} OVER (${over})` : fn;
    }
    case "single_quote_string":
    case "double_quote_string":
    case "string":
      return `'${node.value}'`;
    case "number":
      return String(node.value);
    case "bool":
      return String(node.value);
    case "null":
      return "NULL";
    case "expr_list":
      return (node.value ?? []).map(exprToString).join(", ");
    case "case": {
      const whens = (node.args ?? [])
        .map((w: any) => `WHEN ${exprToString(w.cond)} THEN ${exprToString(w.result)}`)
        .join(" ");
      const els = node.else ? ` ELSE ${exprToString(node.else)}` : "";
      return `CASE ${whens}${els} END`;
    }
    default:
      if (ident(node.column)) return ident(node.column);
      if (ident(node.value)) return ident(node.value);
      return "";
  }
}

export function windowSpecToString(over: any): string {
  if (!over) return "";
  const spec =
    over.as_window_specification?.window_specification ??
    over.window_specification ??
    over;
  const parts: string[] = [];
  const partition = spec.partitionby ?? spec.partition_by;
  if (partition?.length) {
    parts.push(
      `PARTITION BY ${partition.map((p: any) => exprToString(p.expr ?? p)).join(", ")}`,
    );
  }
  const order = spec.orderby ?? spec.order_by;
  if (order?.length) {
    parts.push(
      `ORDER BY ${order
        .map((o: any) => `${exprToString(o.expr)}${o.type ? ` ${o.type}` : ""}`)
        .join(", ")}`,
    );
  }
  return parts.join(" ");
}

/** node-sql-parser wraps subqueries as { ast: SelectAST } without a type field. */
export function selectBody(node: any): any | null {
  if (!node) return null;
  if (node.type === "select") return node;
  if (node.ast?.type === "select") return node.ast;
  return null;
}

export function columnsToString(columns: any): string {
  if (!columns) return "*";
  if (columns === "*") return "*";
  if (!Array.isArray(columns)) return exprToString(columns);

  return columns
    .map((col) => {
      if (col.expr) {
        const base = exprToString(col.expr);
        const alias = ident(col.as);
        return alias ? `${base} AS ${alias}` : base;
      }
      return exprToString(col);
    })
    .filter(Boolean)
    .join(", ");
}

export function findRange(
  sql: string,
  needle: string,
  from = 0,
): { start: number; end: number } | undefined {
  if (!needle) return undefined;
  const idx = sql.toLowerCase().indexOf(needle.toLowerCase(), from);
  if (idx < 0) return undefined;
  return { start: idx, end: idx + needle.length };
}
