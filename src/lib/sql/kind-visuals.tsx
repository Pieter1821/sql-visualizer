import {
  ArrowUpDown,
  Braces,
  Columns3,
  Database,
  Filter,
  Flag,
  GitBranch,
  GitMerge,
  KeyRound,
  Layers,
  ListFilter,
  Merge,
  Pencil,
  Play,
  Plus,
  Rows3,
  ScanLine,
  ScanSearch,
  Table2,
  Target,
  Terminal,
  Trash2,
} from "lucide-react";
import type { ReactElement } from "react";
import type { NodeKind } from "@/lib/sql/types";

type IconProps = { size?: number; strokeWidth?: number };

/**
 * A record of render functions rather than components, so looking an icon up
 * by kind never creates a component type during render.
 */
const RENDER: Record<NodeKind, (p: IconProps) => ReactElement> = {
  start: (p) => <Play {...p} />,
  param: (p) => <KeyRound {...p} />,
  cte: (p) => <Layers {...p} />,
  table: (p) => <Table2 {...p} />,
  join: (p) => <GitMerge {...p} />,
  where: (p) => <Filter {...p} />,
  groupby: (p) => <Rows3 {...p} />,
  orderby: (p) => <ArrowUpDown {...p} />,
  having: (p) => <ListFilter {...p} />,
  select: (p) => <Columns3 {...p} />,
  distinct: (p) => <ScanLine {...p} />,
  limit: (p) => <Filter {...p} />,
  insert: (p) => <Plus {...p} />,
  update: (p) => <Pencil {...p} />,
  delete: (p) => <Trash2 {...p} />,
  union: (p) => <Merge {...p} />,
  if: (p) => <GitBranch {...p} />,
  stmt: (p) => <Terminal {...p} />,
  window: (p) => <ScanSearch {...p} />,
  subquery: (p) => <Braces {...p} />,
  qualify: (p) => <ListFilter {...p} />,
  column: (p) => <Columns3 {...p} />,
  result: (p) => <Target {...p} />,
  end: (p) => <Flag {...p} />,
};

export function KindIcon({
  kind,
  size = 16,
  strokeWidth = 2,
}: { kind: NodeKind } & IconProps) {
  const render = RENDER[kind];
  return render ? render({ size, strokeWidth }) : <Database size={size} />;
}

const KIND_ACCENT: Partial<Record<NodeKind, string>> = {
  table: "#077ac7",
  cte: "#6b21ef",
  join: "#b26bf5",
  where: "#fd8925",
  groupby: "#f2a60c",
  having: "#ff492c",
  select: "#4285f4",
  distinct: "#00a63e",
  limit: "#9d9797",
  orderby: "#9d9797",
  insert: "#00a63e",
  update: "#f2a60c",
  delete: "#ff492c",
  union: "#b26bf5",
  param: "#4285f4",
  if: "#fd8925",
  window: "#9b72cb",
  subquery: "#4285f4",
  qualify: "#fd8925",
  result: "#00a63e",
  start: "#00a63e",
  end: "#00a63e",
};

/** Plain-language name for the operator, so a card reads without SQL fluency. */
const KIND_TITLE: Partial<Record<NodeKind, string>> = {
  table: "Read from",
  cte: "Named subquery",
  join: "Join",
  where: "Filter rows",
  groupby: "Group rows",
  having: "Filter groups",
  select: "Pick columns",
  distinct: "Drop duplicates",
  limit: "Cap rows",
  orderby: "Sort",
  union: "Combine",
  insert: "Insert into",
  update: "Update",
  delete: "Delete from",
  result: "Result",
  param: "Parameter",
  if: "Branch",
  stmt: "Expression",
  window: "Window fn",
  subquery: "Subquery",
  qualify: "Filter windows",
};

export const accentFor = (kind: NodeKind) => KIND_ACCENT[kind] ?? "#077ac7";
export const titleFor = (kind: NodeKind) => KIND_TITLE[kind] ?? kind;
