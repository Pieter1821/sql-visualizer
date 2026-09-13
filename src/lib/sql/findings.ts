import type { Finding } from "./explain";
import type { VisualModel } from "./types";

const DIALECT_MARKERS: Record<string, { label: string; pattern: RegExp }[]> = {
  PostgreSQL: [
    { label: "DATE_TRUNC", pattern: /\bdate_trunc\s*\(/i },
    { label: "ILIKE", pattern: /\bilike\b/i },
    { label: "::cast", pattern: /::[\w[\]]+/ },
  ],
  TransactSQL: [
    { label: "GETDATE", pattern: /\bgetdate\s*\(/i },
    { label: "DATEADD", pattern: /\bdateadd\s*\(/i },
    { label: "TOP", pattern: /\btop\s+\d+/i },
  ],
  MySQL: [
    { label: "IFNULL", pattern: /\bifnull\s*\(/i },
    { label: "LIMIT offset", pattern: /\blimit\s+\d+\s*,\s*\d+/i },
  ],
  Snowflake: [
    { label: "QUALIFY", pattern: /\bqualify\b/i },
    { label: "EXCLUDE", pattern: /\bexclude\s*\(/i },
  ],
};

function dialectFindings(sql: string, dialect?: string): Finding[] {
  if (!dialect || dialect === "auto") return [];
  const out: Finding[] = [];
  for (const [d, markers] of Object.entries(DIALECT_MARKERS)) {
    if (d === dialect) continue;
    for (const m of markers) {
      if (m.pattern.test(sql)) {
        out.push({
          tone: "watch",
          text: `${m.label} looks ${d}-specific. Parser used ${dialect}.`,
        });
      }
    }
  }
  return out;
}

function hasJoinCondition(detail?: string) {
  return /\b(ON|USING)\b/i.test(detail ?? "");
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.tone}:${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Static checks a senior dev would run before trusting a plan. */
export function analyzeFindings(sql: string, model: VisualModel): Finding[] {
  const findings: Finding[] = [...dialectFindings(sql, model.dialectUsed)];

  const bareJoins = model.nodes.filter(
    (n) =>
      n.kind === "join" &&
      !/CROSS/i.test(n.label) &&
      !hasJoinCondition(n.detail),
  );
  if (bareJoins.length === 1) {
    findings.push({
      tone: "watch",
      text: `${bareJoins[0].label} has no ON/USING clause — implicit cross join.`,
    });
  } else if (bareJoins.length > 1) {
    findings.push({
      tone: "watch",
      text: `${bareJoins.length} joins have no ON/USING clause — implicit cross join risk.`,
    });
  }

  const commaCross = model.nodes.filter(
    (n) =>
      n.kind === "join" &&
      /CROSS/i.test(n.label) &&
      /Comma join/i.test(n.detail ?? ""),
  );
  if (commaCross.length) {
    findings.push({
      tone: "watch",
      text:
        commaCross.length === 1
          ? "Comma FROM list with no join predicate — classic accidental cross join."
          : `${commaCross.length} comma joins with no ON — accidental Cartesian product risk.`,
    });
  }

  const correlated = model.nodes.filter(
    (n) => n.kind === "subquery" && /CORRELATED/i.test(n.detail ?? ""),
  );
  if (correlated.length === 1) {
    findings.push({
      tone: "watch",
      text: `Correlated subquery "${correlated[0].label}" may execute once per outer row.`,
    });
  } else if (correlated.length > 1) {
    findings.push({
      tone: "watch",
      text: `${correlated.length} correlated subqueries may execute once per outer row.`,
    });
  }

  const recursive = model.nodes.filter(
    (n) => n.kind === "cte" && /RECURSIVE/i.test(n.detail ?? ""),
  );
  if (recursive.length) {
    findings.push({
      tone: "note",
      text:
        recursive.length === 1
          ? `Recursive CTE "${recursive[0].label}" — look for the self-reference in the UNION ALL arm.`
          : `${recursive.length} recursive CTEs — verify the recursive self-join arms.`,
    });
  }

  if (
    /\bqualify\b/i.test(sql) &&
    model.dialectUsed &&
    !/snowflake|bigquery/i.test(model.dialectUsed)
  ) {
    findings.push({
      tone: "watch",
      text: `QUALIFY is Snowflake/BigQuery-specific — parser dialect is ${model.dialectUsed}.`,
    });
  } else if (/\bqualify\b/i.test(sql) && model.nodes.some((n) => n.kind === "qualify")) {
    findings.push({
      tone: "note",
      text: "QUALIFY filters after window functions (not standard SQL/Postgres).",
    });
  }

  if (/\bwhere\b[\s\S]{0,120}\bis\s+null\b/i.test(sql) && /\=\s*null\b/i.test(sql)) {
    findings.push({
      tone: "watch",
      text: "= NULL never matches. Use IS NULL.",
    });
  }

  if (/\bleft\s+join\b/i.test(sql)) {
    findings.push({
      tone: "note",
      text: "LEFT JOIN keeps unmatched left rows — NULLs on the right.",
    });
  }

  if (/\bselect\s+\*/i.test(sql)) {
    findings.push({
      tone: "note",
      text: "SELECT * — column list is not fixed in the diagram.",
    });
  }

  if (model.stats.subqueries >= 2) {
    findings.push({
      tone: "note",
      text: `${model.stats.subqueries} nested SELECTs — read inside-out.`,
    });
  }

  if (!findings.length && model.nodes.length) {
    findings.push({
      tone: "ok",
      text: "Structure only — no row counts, no plan, nothing executes.",
    });
  }

  return dedupe(findings);
}

export function topFindings(
  sql: string,
  model: VisualModel,
  max = 3,
): Finding[] {
  const all = analyzeFindings(sql, model);
  const order = { watch: 0, note: 1, ok: 2 };
  return [...all].sort((a, b) => order[a.tone] - order[b.tone]).slice(0, max);
}
