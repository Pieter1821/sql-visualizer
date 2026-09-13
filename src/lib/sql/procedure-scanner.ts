import {
  emptyStats,
  type VisualEdge,
  type VisualModel,
  type VisualNode,
  type VisualStats,
} from "./types";

type Token = {
  kind: string;
  value: string;
  start: number;
  end: number;
};

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const re =
    /(\/\*[\s\S]*?\*\/)|(--[^\n]*)|('(?:''|[^'])*')|(@[A-Za-z_][\w@$#]*)|(\b(?:CREATE|ALTER|PROCEDURE|PROC|AS|BEGIN|END|IF|ELSE|WHILE|EXISTS|SELECT|INSERT|UPDATE|DELETE|FROM|JOIN|WHERE|GROUP|ORDER|BY|HAVING|WITH|RETURN|SET|INTO|VALUES)\b)|([A-Za-z_][\w@$#]*)|([();,=<>!+\-*/])|(\s+)/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    const [
      ,
      block,
      line,
      str,
      param,
      keyword,
      ident,
      punct,
      space,
    ] = match;
    if (space || block || line) continue;
    const value = match[0];
    const start = match.index;
    const end = start + value.length;
    if (str) tokens.push({ kind: "string", value, start, end });
    else if (param) tokens.push({ kind: "param", value, start, end });
    else if (keyword)
      tokens.push({ kind: "keyword", value: value.toUpperCase(), start, end });
    else if (ident) tokens.push({ kind: "ident", value, start, end });
    else if (punct) tokens.push({ kind: "punct", value, start, end });
  }
  return tokens;
}

function isKeyword(t: Token | undefined, ...words: string[]) {
  return !!t && t.kind === "keyword" && words.includes(t.value);
}

export function isProcedureSql(sql: string): boolean {
  return /\b(CREATE|ALTER)\s+(PROC|PROCEDURE)\b/i.test(sql);
}

export function buildProcedureModel(sql: string): VisualModel {
  const tokens = tokenize(sql);
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];
  const stats: VisualStats = emptyStats();
  let idSeq = 0;

  const nid = (prefix: string) => {
    idSeq += 1;
    return `${prefix}-${idSeq}`;
  };

  const link = (
    source: string,
    target: string,
    label?: string,
    kind: VisualEdge["kind"] = "flow",
  ) => {
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

  let i = 0;
  let procName = "PROCEDURE";
  const params: VisualNode[] = [];

  // CREATE/ALTER PROCEDURE name
  while (i < tokens.length) {
    if (
      isKeyword(tokens[i], "CREATE", "ALTER") &&
      isKeyword(tokens[i + 1], "PROCEDURE", "PROC")
    ) {
      const nameTok = tokens[i + 2];
      if (nameTok && (nameTok.kind === "ident" || nameTok.kind === "param")) {
        procName = nameTok.value;
      }
      i += 3;
      break;
    }
    i += 1;
  }

  // Parameters until AS
  while (i < tokens.length && !isKeyword(tokens[i], "AS")) {
    if (tokens[i].kind === "param") {
      const p = tokens[i];
      const typeTok = tokens[i + 1];
      const id = nid("param");
      params.push({
        id,
        kind: "param",
        label: p.value,
        detail: typeTok?.kind === "ident" ? typeTok.value.toUpperCase() : "PARAMETER",
        sqlRange: { start: p.start, end: p.end },
      });
    }
    i += 1;
  }

  // Skip AS / BEGIN
  while (i < tokens.length && (isKeyword(tokens[i], "AS") || isKeyword(tokens[i], "BEGIN"))) {
    i += 1;
  }

  let last = startId;
  const procId = nid("stmt");
  nodes.push({
    id: procId,
    kind: "stmt",
    label: procName,
    detail: "STORED PROCEDURE",
    sqlRange: { start: 0, end: Math.min(sql.length, 80) },
  });
  link(last, procId);
  last = procId;

  for (const p of params) {
    nodes.push(p);
    link(last, p.id);
    last = p.id;
  }

  type Frame = { mergeId: string; yesFrom?: string; noFrom?: string };
  const stack: Frame[] = [];

  const addStmt = (
    kind: VisualNode["kind"],
    label: string,
    start: number,
    end: number,
    detail?: string,
  ) => {
    const id = nid(kind);
    nodes.push({
      id,
      kind,
      label,
      detail,
      sqlRange: { start, end },
    });
    link(last, id);
    last = id;
    stats.statements += 1;
    if (kind === "table" || kind === "select" || kind === "insert" || kind === "update" || kind === "delete") {
      // counted below where relevant
    }
    return id;
  };

  const consumeStatement = (startIdx: number): number => {
    let j = startIdx;
    let depth = 0;
    const start = tokens[startIdx]?.start ?? 0;
    while (j < tokens.length) {
      if (isKeyword(tokens[j], "BEGIN")) depth += 1;
      if (isKeyword(tokens[j], "END")) {
        if (depth === 0) break;
        depth -= 1;
      }
      if (
        depth === 0 &&
        (tokens[j].value === ";" ||
          isKeyword(tokens[j], "IF", "ELSE", "WHILE", "END", "BEGIN"))
      ) {
        if (tokens[j].value === ";") {
          return j;
        }
        // keyword boundary — statement ended before this token
        break;
      }
      j += 1;
    }
    void start;
    return Math.max(j - 1, startIdx);
  };

  while (i < tokens.length) {
    const t = tokens[i];

    if (isKeyword(t, "END") && stack.length === 0) {
      break;
    }

    if (isKeyword(t, "IF")) {
      const ifStart = t.start;
      let j = i + 1;
      // find body start after condition
      while (
        j < tokens.length &&
        !isKeyword(tokens[j], "BEGIN") &&
        !isKeyword(tokens[j], "SELECT", "INSERT", "UPDATE", "DELETE", "SET", "IF")
      ) {
        j += 1;
      }

      const condEnd = tokens[j - 1]?.end ?? t.end;
      const ifId = nid("if");
      nodes.push({
        id: ifId,
        kind: "if",
        label: "IF",
        detail: sql.slice(t.start, condEnd).replace(/\s+/g, " ").trim(),
        sqlRange: { start: ifStart, end: condEnd },
      });
      link(last, ifId);
      stats.statements += 1;
      stats.filters += 1;

      const mergeId = nid("stmt");
      // placeholder merge — filled later
      stack.push({ mergeId, yesFrom: undefined, noFrom: ifId });
      last = ifId;

      // YES branch entry
      const yesStart = last;
      // Move into body
      if (isKeyword(tokens[j], "BEGIN")) {
        i = j + 1;
      } else {
        i = j;
      }

      // Mark that next statements are YES until ELSE or END
      stack[stack.length - 1].yesFrom = yesStart;
      // Create a synthetic YES anchor by keeping last = ifId and labeling first edge later
      // We'll link YES on first child
      const yesAnchor = nid("stmt");
      nodes.push({
        id: yesAnchor,
        kind: "stmt",
        label: "YES",
        detail: "BRANCH",
      });
      link(ifId, yesAnchor, "YES", "yes");
      last = yesAnchor;
      continue;
    }

    if (isKeyword(t, "ELSE") && stack.length > 0) {
      const frame = stack[stack.length - 1];
      // Close YES side into merge later; start NO branch from IF
      const ifNode = [...nodes].reverse().find((n) => n.kind === "if");
      const noAnchor = nid("stmt");
      nodes.push({
        id: noAnchor,
        kind: "stmt",
        label: "NO",
        detail: "BRANCH",
      });
      if (ifNode) link(ifNode.id, noAnchor, "NO", "no");
      // Remember YES last for merge
      frame.yesFrom = last;
      frame.noFrom = noAnchor;
      last = noAnchor;
      i += 1;
      if (isKeyword(tokens[i], "BEGIN")) i += 1;
      continue;
    }

    if (isKeyword(t, "END") && stack.length > 0) {
      const frame = stack.pop()!;
      // If no ELSE, NO goes empty to merge
      const ifNode = [...nodes].reverse().find((n) => n.kind === "if");
      nodes.push({
        id: frame.mergeId,
        kind: "stmt",
        label: "MERGE",
        detail: "IF COMPLETE",
      });

      link(last, frame.mergeId);
      if (frame.yesFrom && frame.yesFrom !== last) {
        // already linked via last if we were on yes
      }
      // If ELSE never happened, add empty NO edge to merge
      const hasNo = edges.some((e) => e.label === "NO" && ifNode && e.source === ifNode.id);
      if (!hasNo && ifNode) {
        link(ifNode.id, frame.mergeId, "NO", "no");
      }
      last = frame.mergeId;
      i += 1;
      continue;
    }

    if (isKeyword(t, "SELECT", "INSERT", "UPDATE", "DELETE", "SET", "WITH")) {
      const endIdx = consumeStatement(i);
      const start = t.start;
      const end = tokens[endIdx]?.end ?? t.end;
      const snippet = sql.slice(start, end).replace(/\s+/g, " ").trim();
      const kind =
        t.value === "SELECT"
          ? "select"
          : t.value === "INSERT"
            ? "insert"
            : t.value === "UPDATE"
              ? "update"
              : t.value === "DELETE"
                ? "delete"
                : "stmt";

      if (/\bJOIN\b/i.test(snippet)) stats.joins += 1;
      if (/\bWHERE\b/i.test(snippet)) stats.filters += 1;
      const tableMatch = snippet.match(
        /\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w@$#]*)/i,
      );
      if (tableMatch) stats.tables += 1;

      addStmt(kind, t.value, start, end, snippet.slice(0, 120));
      i = endIdx + 1;
      if (tokens[i]?.value === ";") i += 1;
      continue;
    }

    if (isKeyword(t, "WHILE")) {
      const id = addStmt("if", "WHILE", t.start, t.end, "LOOP");
      void id;
      i += 1;
      continue;
    }

    if (isKeyword(t, "BEGIN")) {
      i += 1;
      continue;
    }

    i += 1;
  }

  const endId = nid("end");
  nodes.push({ id: endId, kind: "end", label: "END" });
  link(last, endId);

  return {
    kind: "procedure",
    nodes,
    edges,
    stats,
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
