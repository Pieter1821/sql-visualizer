/**
 * Senior-SQL scenario audit — run with:
 *   npx tsx scripts/audit-scenarios.mts
 * or compile via next's path aliases through a small loader.
 */

async function loadParse() {
  try {
    // When run via `npx tsx`, TypeScript path aliases won't resolve — register relative.
    const mod = await import("../src/lib/sql/parse.ts");
    return mod.parseSqlToVisualModel;
  } catch {
    const mod = await import("../src/lib/sql/parse.js");
    return mod.parseSqlToVisualModel;
  }
}

async function loadFindings() {
  try {
    const mod = await import("../src/lib/sql/findings.ts");
    return mod.analyzeFindings;
  } catch {
    const mod = await import("../src/lib/sql/findings.js");
    return mod.analyzeFindings;
  }
}

const QUERIES = [
  {
    id: 1,
    name: "Baseline join+agg",
    dialect: "auto",
    sql: `SELECT c.customer_name, COUNT(o.order_id) AS order_count, SUM(o.total_amount) AS total_spent
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE o.order_date >= '2025-01-01'
GROUP BY c.customer_name
ORDER BY total_spent DESC;`,
  },
  {
    id: 2,
    name: "Window only",
    dialect: "auto",
    sql: `SELECT employee_id, department, salary,
RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank,
salary - AVG(salary) OVER (PARTITION BY department) AS diff_from_avg
FROM employees;`,
  },
  {
    id: 3,
    name: "Correlated subquery",
    dialect: "auto",
    sql: `SELECT e.employee_id, e.name, e.salary
FROM employees e
WHERE e.salary > (
    SELECT AVG(e2.salary) FROM employees e2 WHERE e2.department = e.department
);`,
  },
  {
    id: 4,
    name: "FROM subquery",
    dialect: "auto",
    sql: `SELECT dept_totals.department, dept_totals.total
FROM (
    SELECT department, SUM(salary) AS total
    FROM employees
    GROUP BY department
) dept_totals
WHERE dept_totals.total > 100000;`,
  },
  {
    id: 5,
    name: "CTE chain",
    dialect: "auto",
    sql: `WITH regional_sales AS (
    SELECT region, SUM(amount) AS total_sales FROM orders GROUP BY region
),
top_regions AS (
    SELECT region FROM regional_sales WHERE total_sales > 500000
)
SELECT o.order_id, o.region, o.amount
FROM orders o
JOIN top_regions t ON o.region = t.region;`,
  },
  {
    id: 6,
    name: "Recursive CTE",
    dialect: "auto",
    sql: `WITH RECURSIVE org_chart AS (
    SELECT employee_id, manager_id, name, 1 AS level
    FROM employees WHERE manager_id IS NULL
    UNION ALL
    SELECT e.employee_id, e.manager_id, e.name, oc.level + 1
    FROM employees e
    JOIN org_chart oc ON e.manager_id = oc.employee_id
)
SELECT * FROM org_chart ORDER BY level;`,
  },
  {
    id: 7,
    name: "Set ops",
    dialect: "auto",
    sql: `SELECT customer_id FROM active_customers
UNION
SELECT customer_id FROM trial_customers
EXCEPT
SELECT customer_id FROM banned_customers;`,
  },
  {
    id: 8,
    name: "Comma cross join",
    dialect: "auto",
    sql: `SELECT o.order_id, c.customer_name
FROM orders o, customers c
WHERE o.status = 'shipped';`,
  },
  {
    id: 9,
    name: "QUALIFY",
    dialect: "auto",
    sql: `SELECT customer_id, order_date, amount,
SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date) AS running_total
FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) = 1;`,
  },
];

const parseSqlToVisualModel = await loadParse();
const analyzeFindings = await loadFindings();

for (const q of QUERIES) {
  const model = parseSqlToVisualModel(q.sql, q.dialect);
  const kinds = model.nodes
    .filter((n) => n.kind !== "start" && n.kind !== "end")
    .map((n) => `${n.kind}:${n.label}`)
    .join(" → ");
  const findings = analyzeFindings(q.sql, model)
    .filter((f) => f.tone === "watch" || f.tone === "note")
    .map((f) => f.text)
    .slice(0, 3);
  console.log(`\n#${q.id} ${q.name}`);
  console.log("  dialect", model.dialectUsed, model.kind, model.warning ?? "");
  console.log("  stats", JSON.stringify(model.stats));
  console.log("  pipeline", kinds);
  if (findings.length) console.log("  findings", findings.join(" | "));
}
