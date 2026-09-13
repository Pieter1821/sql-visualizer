"use client";

import { memo, type CSSProperties } from "react";
import {
  Handle,
  Position,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  cardinalityStyle,
  type CardinalityInfo,
} from "@/lib/sql/cardinality";
import { KindIcon, accentFor, titleFor } from "@/lib/sql/kind-visuals";
import { NODE_WIDTH } from "@/lib/sql/layout";
import type { NodeKind, SqlRange } from "@/lib/sql/types";

export type SqlNodeData = {
  kind: NodeKind;
  label: string;
  detail?: string;
  hint?: string;
  meta?: string;
  step?: number;
  phase?: string;
  cardinality?: CardinalityInfo;
  sqlRange?: SqlRange;
};

type SqlFlowNode = Node<SqlNodeData, "sqlNode">;

const COMPACT_ZOOM = 0.48;
const HANDLE = "!h-1.5 !w-1.5 !border-0 !bg-transparent !opacity-0";

function sweepDelay(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  return `-${(hash / 1000) * 5}s`;
}

function SqlNodeComponent({ id, data, selected }: NodeProps<SqlFlowNode>) {
  const accent = accentFor(data.kind);
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);
  const cardStyle = data.cardinality
    ? cardinalityStyle(data.cardinality.effect)
    : null;

  return (
    <div
      className={[
        "sql-flow-node",
        selected
          ? "sql-node-card sql-node-selected"
          : "sql-node-card",
      ].join(" ")}
      style={
        {
          width: NODE_WIDTH,
          "--node-accent": accent,
          "--sweep-delay": sweepDelay(id),
        } as CSSProperties
      }
      aria-selected={selected}
      data-node-kind={data.kind}
      data-testid="flow-node"
    >
      <Handle id="in-top" type="target" position={Position.Top} className={HANDLE} />
      <Handle id="in-left" type="target" position={Position.Left} className={HANDLE} />
      <Handle id="in-right" type="target" position={Position.Right} className={HANDLE} />

      <div className="sql-flow-node-inner flex flex-col px-5 py-4">
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex shrink-0 items-center justify-center rounded-xl text-cloud-white"
              style={{
                background: `color-mix(in srgb, ${accent} 32%, transparent)`,
                width: compact ? 36 : 30,
                height: compact ? 36 : 30,
              }}
            >
              <KindIcon kind={data.kind} size={compact ? 20 : 16} />
            </span>
            <div className="min-w-0">
              {data.phase && !compact ? (
                <p className="text-[10px] font-medium uppercase leading-snug tracking-[0.12em] text-white/70">
                  {data.phase}
                </p>
              ) : null}
              <p
                className={[
                  "font-semibold uppercase leading-snug tracking-[0.08em] break-words text-cloud-white",
                  compact ? "text-[17px]" : "text-[12px]",
                  data.phase && !compact ? "mt-1" : "",
                ].join(" ")}
              >
                {titleFor(data.kind)}
              </p>
            </div>
          </div>
          {data.step && !compact ? (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none text-cloud-white"
              style={{
                background: `color-mix(in srgb, ${accent} 40%, #100d17)`,
                border: `1px solid color-mix(in srgb, ${accent} 72%, white)`,
              }}
            >
              {data.step}
            </span>
          ) : null}
        </div>

        <p
          className={[
            "mt-2.5 font-medium leading-snug break-words text-cloud-white",
            compact ? "text-[24px]" : "text-[20px]",
          ].join(" ")}
        >
          {data.label}
        </p>

        {data.cardinality && !compact ? (
          <span
            className="mt-2 inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-medium leading-snug break-words text-cloud-white"
            style={{
              background: cardStyle?.bg ?? "rgba(255,255,255,0.08)",
              border: `1px solid color-mix(in srgb, ${cardStyle?.text ?? "#fff"} 45%, transparent)`,
            }}
          >
            <span aria-hidden>{cardStyle?.symbol}</span>
            <span>{data.cardinality.label}</span>
          </span>
        ) : null}

        {compact ? (
          data.detail ? (
            <p
              className="mt-2 font-mono text-[12px] leading-snug break-words text-white/85"
              data-testid="flow-node-detail"
            >
              {data.detail}
            </p>
          ) : null
        ) : (
          <>
            <div className="mt-2.5 space-y-1.5">
              {data.hint ? (
                <p className="text-[13px] leading-snug break-words text-white/90">
                  {data.hint}
                </p>
              ) : null}
              {data.detail ? (
                <p
                  className="font-mono text-[12px] leading-snug break-words text-white/85"
                  data-testid="flow-node-detail"
                >
                  {data.detail}
                </p>
              ) : null}
            </div>

            {data.meta ? (
              <p className="mt-2.5 border-t border-white/15 pt-2.5 text-[11px] leading-snug break-words text-white/75">
                {data.meta}
              </p>
            ) : null}
          </>
        )}
      </div>

      <Handle id="out-bottom" type="source" position={Position.Bottom} className={HANDLE} />
      <Handle id="out-right" type="source" position={Position.Right} className={HANDLE} />
      <Handle id="out-left" type="source" position={Position.Left} className={HANDLE} />
    </div>
  );
}

export const SqlNode = memo(SqlNodeComponent);
