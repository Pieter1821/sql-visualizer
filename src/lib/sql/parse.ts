import { Parser } from "node-sql-parser";
import { complexityFromSql, touchesFromNodes } from "./complexity";
import { AUTO_ORDER, type DialectId } from "./dialects";
import { buildHeuristicModel } from "./fallback-scanner";
import { buildProcedureModel, isProcedureSql } from "./procedure-scanner";
import { buildQueryModel } from "./query-walker";
import { emptyModel, type VisualModel } from "./types";

const parser = new Parser();

function enrich(model: VisualModel, sql: string, dialectUsed?: string): VisualModel {
  return {
    ...model,
    dialectUsed,
    complexity: complexityFromSql(sql, model.nodes),
    touches:
      model.touches?.length > 0 ? model.touches : touchesFromNodes(model.nodes),
  };
}

function tryAst(sql: string, dialect: Exclude<DialectId, "auto">): VisualModel | null {
  try {
    const ast = parser.astify(sql, { database: dialect });
    if (!ast) return null;
    const statements = Array.isArray(ast) ? ast : [ast];
    if (!statements.length) return null;
    return enrich(buildQueryModel(sql, statements), sql, dialect);
  } catch {
    return null;
  }
}

export function parseSqlToVisualModel(
  sql: string,
  dialect: DialectId = "auto",
): VisualModel {
  const trimmed = sql.trim();
  if (!trimmed) return emptyModel();

  if (isProcedureSql(trimmed)) {
    try {
      return enrich(buildProcedureModel(trimmed), trimmed, dialect === "auto" ? "TransactSQL" : dialect);
    } catch {
      return enrich(buildHeuristicModel(trimmed), trimmed);
    }
  }

  if (dialect !== "auto") {
    const hit = tryAst(trimmed, dialect);
    if (hit) return hit;
    return enrich(buildHeuristicModel(trimmed), trimmed);
  }

  for (const id of AUTO_ORDER) {
    const hit = tryAst(trimmed, id);
    if (hit) return hit;
  }

  return enrich(buildHeuristicModel(trimmed), trimmed);
}
