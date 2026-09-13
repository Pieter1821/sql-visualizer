import { complexityFromSql, isSqlKeyword, touchesFromNodes } from "./complexity";
import {
  emptyStats,
  type VisualEdge,
  type VisualModel,
  type VisualNode,
  type VisualStats,
} from "./types";

const TABLE_LEAD =
  /\b(?:from|join|into|update|delete\s+from)\s+([A-Za-z_][\w$#@]*(?:\.[A-Za-z_][\w$#@]*)?)/gi;
const JOIN_RE =
  /\b((?:inner|left|right|full|cross|outer)\s+)?(?:outer\s+)?join\b/gi;
const CTE_RE = /\b([A-Za-z_][\w$#@]*)\s+as\s*\(/gi;
const COL_RE = /\b([A-Za-z_][\w$#@]*)\.([A-Za-z_][\w$#@]*)\b/g;

function stripComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length)).replace(
    /--[^\n]*/g,
    (m) => " ".repeat(m.length),
  );
}

function findRange(sql: string, needle: string, from = 0) {
  const idx = sql.toLowerCase().indexOf(needle.toLowerCase(), from);
  if (idx < 0) return undefined;
  return { start: idx, end: idx + needle.length };
}

export function buildHeuristicModel(sql: string): VisualModel {
  const cleaned = stripComments(sql);
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];
  const stats: VisualStats = emptyStats();
  let seq = 0;
  const nid = (p: string) => {
    seq += 1;
    return `${p}-${seq}`;
  };
  const link = (source: string, target: string, label?: string, kind: VisualEdge["kind"] = "flow") => {
    edges.push({
      id: `e-${source}-${target}-${edges.length}`,
      source,
      target,
      label,
      kind,
    });
  };

  const startId = nid("start");
  nodes.push({ id: startId, kind: "start", label: "START" });
  let last = startId;

  const cteNames = new Set<string>();
  if (/\bwith\b/i.test(cleaned)) {
    let m: RegExpExecArray | null;
    const re = new RegExp(CTE_RE.source, "gi");
    while ((m = re.exec(cleaned))) {
      const name = m[1];
      if (isSqlKeyword(name) || cteNames.has(name.toLowerCase())) continue;
      cteNames.add(name.toLowerCase());
      const id = nid("cte");
      nodes.push({
        id,
        kind: "cte",
        label: name,
        detail: /\brecursive\b/i.test(cleaned) ? "RECURSIVE CTE" : "CTE",
        sqlRange: { start: m.index, end: m.index + name.length },
      });
      link(last, id);
      last = id;
      stats.ctes += 1;
    }
  }

  const seenTables = new Set<string>();
  let tm: RegExpExecArray | null;
  const tableRe = new RegExp(TABLE_LEAD.source, "gi");
  while ((tm = tableRe.exec(cleaned))) {
    const raw = tm[1];
    if (isSqlKeyword(raw) || seenTables.has(raw.toLowerCase())) continue;
    if (cteNames.has(raw.toLowerCase())) continue;
    seenTables.add(raw.toLowerCase());
    const id = nid("table");
    nodes.push({
      id,
      kind: "table",
      label: raw,
      sqlRange: { start: tm.index + tm[0].length - raw.length, end: tm.index + tm[0].length },
    });
    link(last, id);
    last = id;
    stats.tables += 1;
  }

  let jm: RegExpExecArray | null;
  const joinRe = new RegExp(JOIN_RE.source, "gi");
  while ((jm = joinRe.exec(cleaned))) {
    const label = (jm[0] || "JOIN").replace(/\s+/g, " ").toUpperCase();
    const id = nid("join");
    nodes.push({
      id,
      kind: "join",
      label,
      sqlRange: { start: jm.index, end: jm.index + jm[0].length },
    });
    link(last, id);
    last = id;
    stats.joins += 1;
  }

  const clauses: Array<{ kind: VisualNode["kind"]; needle: string }> = [
    { kind: "where", needle: "WHERE" },
    { kind: "groupby", needle: "GROUP BY" },
    { kind: "having", needle: "HAVING" },
    { kind: "orderby", needle: "ORDER BY" },
  ];
  for (const clause of clauses) {
    const range = findRange(cleaned, clause.needle);
    if (!range) continue;
    const id = nid(clause.kind);
    nodes.push({
      id,
      kind: clause.kind,
      label: clause.needle,
      sqlRange: range,
    });
    link(last, id);
    last = id;
    if (clause.kind === "where" || clause.kind === "having") stats.filters += 1;
  }

  const unions = cleaned.match(/\bunion(\s+all)?\b/gi) ?? [];
  for (const u of unions) {
    const id = nid("union");
    nodes.push({
      id,
      kind: "union",
      label: u.toUpperCase().replace(/\s+/g, " "),
    });
    link(last, id);
    last = id;
    stats.unions += 1;
  }

  if (/\bselect\b/i.test(cleaned)) {
    const id = nid("select");
    const range = findRange(cleaned, "SELECT");
    nodes.push({ id, kind: "select", label: "SELECT", sqlRange: range });
    link(last, id);
    last = id;
    stats.statements += 1;
  }
  if (/\binsert\b/i.test(cleaned)) {
    const id = nid("insert");
    nodes.push({
      id,
      kind: "insert",
      label: "INSERT",
      sqlRange: findRange(cleaned, "INSERT"),
    });
    link(last, id);
    last = id;
    stats.statements += 1;
  }
  if (/\bupdate\b/i.test(cleaned)) {
    const id = nid("update");
    nodes.push({
      id,
      kind: "update",
      label: "UPDATE",
      sqlRange: findRange(cleaned, "UPDATE"),
    });
    link(last, id);
    last = id;
    stats.statements += 1;
  }
  if (/\bdelete\b/i.test(cleaned)) {
    const id = nid("delete");
    nodes.push({
      id,
      kind: "delete",
      label: "DELETE",
      sqlRange: findRange(cleaned, "DELETE"),
    });
    link(last, id);
    last = id;
    stats.statements += 1;
  }
  if (/\bif\b/i.test(cleaned)) {
    const id = nid("if");
    nodes.push({
      id,
      kind: "if",
      label: "IF",
      sqlRange: findRange(cleaned, "IF"),
    });
    link(last, id);
    last = id;
    stats.filters += 1;
  }

  const resultId = nid("result");
  nodes.push({ id: resultId, kind: "result", label: "RESULT" });
  link(last, resultId);

  const colMap = new Map<string, Set<string>>();
  let cm: RegExpExecArray | null;
  const colRe = new RegExp(COL_RE.source, "g");
  while ((cm = colRe.exec(cleaned))) {
    if (isSqlKeyword(cm[1])) continue;
    if (!colMap.has(cm[1])) colMap.set(cm[1], new Set());
    colMap.get(cm[1])!.add(cm[2]);
  }

  const touches = [
    ...touchesFromNodes(nodes),
    ...[...colMap.entries()].map(([name, columns]) => ({
      name,
      columns: [...columns],
    })),
  ].reduce<VisualModel["touches"]>((acc, t) => {
    const existing = acc.find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    if (existing) {
      existing.columns = [...new Set([...existing.columns, ...t.columns])];
    } else {
      acc.push({ ...t });
    }
    return acc;
  }, []);

  return {
    kind: "heuristic",
    nodes,
    edges,
    stats,
    touches,
    complexity: complexityFromSql(sql, nodes),
    warning: "Full AST unavailable. Mapped from the text you pasted.",
  };
}
