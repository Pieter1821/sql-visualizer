export type DialectId =
  | "auto"
  | "PostgreSQL"
  | "TransactSQL"
  | "MySQL"
  | "Sqlite"
  | "BigQuery"
  | "Snowflake"
  | "Redshift"
  | "Hive"
  | "MariaDB";

export const DIALECTS: { id: DialectId; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "PostgreSQL", label: "PostgreSQL" },
  { id: "TransactSQL", label: "SQL Server" },
  { id: "MySQL", label: "MySQL" },
  { id: "Sqlite", label: "SQLite" },
  { id: "BigQuery", label: "BigQuery" },
  { id: "Snowflake", label: "Snowflake" },
  { id: "Redshift", label: "Redshift" },
  { id: "Hive", label: "Hive" },
  { id: "MariaDB", label: "MariaDB" },
];

export const AUTO_ORDER: Exclude<DialectId, "auto">[] = [
  "PostgreSQL",
  "TransactSQL",
  "MySQL",
  "Sqlite",
  "BigQuery",
  "Snowflake",
  "Redshift",
  "Hive",
  "MariaDB",
];
