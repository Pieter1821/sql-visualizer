"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  getNodesBounds,
  useReactFlow,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { Maximize2, Minimize2, PanelLeftClose } from "lucide-react";
import { EmptyHint } from "@/components/motion/EmptyHint";
import { Pressable } from "@/components/motion/Pressable";
import { StepControls } from "@/components/workspace/StepControls";
import { SqlNode } from "@/components/workspace/SqlNode";
import { prefersReducedMotion } from "@/lib/gsap";
import { useIsClient } from "@/lib/use-is-client";
import { NODE_HEIGHT, NODE_WIDTH, toFlowElements } from "@/lib/sql/layout";
import type { Finding } from "@/lib/sql/explain";
import type { PlaySpeed, StepFrame } from "@/lib/sql/step-engine";
import type { VisualModel } from "@/lib/sql/types";

const nodeTypes: NodeTypes = { sqlNode: SqlNode };
const DEFAULT_ZOOM = 1;
const FIT = {
  padding: 0.06,
  minZoom: DEFAULT_ZOOM,
  maxZoom: DEFAULT_ZOOM,
} as const;
const OVERVIEW_NODE_LIMIT = 3;
const INITIAL_NODE_COUNT = 2;

type FlowCanvasProps = {
  model: VisualModel;
  selectedId: string | null;
  onSelect: (nodeId: string | null, node: Node | null) => void;
  findings?: Finding[];
  /** True when the SQL column is already collapsed. */
  sqlCollapsed?: boolean;
  /** Hide the SQL column so this panel can grow. */
  onCollapseSql?: () => void;
  /** Step-through lives on the flow — not a separate mode. */
  stepFrames?: StepFrame[];
  stepIndex?: number;
  stepPlaying?: boolean;
  stepSpeed?: PlaySpeed;
  onStepIndex?: (index: number) => void;
  onStepPlaying?: (playing: boolean) => void;
  onStepSpeed?: (speed: PlaySpeed) => void;
};

function ViewportAnchor({
  nodes,
  paneRef,
  pane,
}: {
  nodes: Node[];
  paneRef: React.RefObject<HTMLDivElement | null>;
  pane: { width: number; height: number };
}) {
  const flow = useReactFlow();
  const signature = nodes
    .map((n) => `${n.id}@${Math.round(n.position.x)}`)
    .join("|");

  useEffect(() => {
    if (!nodes.length) return;
    let cancelled = false;
    const frame = requestAnimationFrame(async () => {
      // Long pipelines stay readable by opening on their first steps instead
      // of shrinking every card into a tiny whole-query overview.
      const initialNodes =
        nodes.length > OVERVIEW_NODE_LIMIT
          ? nodes.slice(0, INITIAL_NODE_COUNT)
          : nodes;
      await flow.fitView({ ...FIT, nodes: initialNodes });
      if (cancelled) return;
      const paneElement = paneRef.current;
      if (!paneElement) return;
      const bounds = getNodesBounds(initialNodes);
      const { x, y } = flow.getViewport();
      flow.setViewport({
        x: Math.round(
          bounds.width <= paneElement.clientWidth ? x : -bounds.x + 24,
        ),
        y: Math.round(
          bounds.height <= paneElement.clientHeight ? y : -bounds.y + 24,
        ),
        zoom: DEFAULT_ZOOM,
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, pane.width, pane.height, flow, paneRef]);

  return null;
}

/** Soft-pan the viewport to the active step/card so Play feels like a tour. */
function FocusSelected({
  selectedId,
  pane,
}: {
  selectedId: string | null;
  pane: { width: number; height: number };
}) {
  const flow = useReactFlow();

  useEffect(() => {
    if (!selectedId || !pane.width || !pane.height) return;
    const node = flow.getNode(selectedId);
    if (!node) return;
    const w = node.measured?.width ?? NODE_WIDTH;
    const h = node.measured?.height ?? NODE_HEIGHT;
    const x = node.position.x + w / 2;
    const y = node.position.y + h / 2;
    const reduce = prefersReducedMotion();
    const zoom = Math.max(flow.getZoom(), DEFAULT_ZOOM);
    void flow.setViewport(
      {
        x: Math.round(pane.width / 2 - x * zoom),
        y: Math.round(pane.height / 2 - y * zoom),
        zoom,
      },
      { duration: reduce ? 0 : 520 },
    );
  }, [selectedId, pane.height, pane.width, flow]);

  return null;
}

const LEGEND: { color: string; label: string }[] = [
  { color: "#077ac7", label: "Table" },
  { color: "#6b21ef", label: "CTE" },
  { color: "#b26bf5", label: "Join" },
  { color: "#fd8925", label: "Filter" },
  { color: "#f2a60c", label: "Group" },
  { color: "#9b72cb", label: "Window" },
  { color: "#fd8925", label: "Qualify" },
  { color: "#4285f4", label: "Subquery" },
  { color: "#00a63e", label: "Result" },
];

export function FlowCanvas({
  model,
  selectedId,
  onSelect,
  findings = [],
  sqlCollapsed = false,
  onCollapseSql,
  stepFrames = [],
  stepIndex = 0,
  stepPlaying = false,
  stepSpeed = 1,
  onStepIndex,
  onStepPlaying,
  onStepSpeed,
}: FlowCanvasProps) {
  const isClient = useIsClient();
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ width: 0, height: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setPane((prev) =>
        Math.abs(prev.width - width) < 24 && Math.abs(prev.height - height) < 24
          ? prev
          : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isClient, fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const { nodes, edges } = useMemo(
    () => toFlowElements(model, pane),
    [model, pane],
  );

  const flowNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
      })),
    [nodes, selectedId],
  );

  const flowEdges = useMemo(() => {
    if (!selectedId) {
      return edges.map((e) => ({
        ...e,
        style: { ...e.style, strokeWidth: 2.8, opacity: 0.85 },
      }));
    }
    return edges.map((e) => {
      const active = e.source === selectedId || e.target === selectedId;
      const stroke = (e.data as { stroke?: string } | undefined)?.stroke;
      return {
        ...e,
        animated: active,
        zIndex: active ? 2 : 0,
        style: {
          ...e.style,
          strokeWidth: active ? 3.6 : 1.4,
          opacity: active ? 1 : 0.46,
        },
        markerEnd:
          typeof e.markerEnd === "object" && stroke
            ? { ...e.markerEnd, color: active ? stroke : "#5a5462" }
            : e.markerEnd,
      };
    });
  }, [edges, selectedId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onSelect(node.id, node),
    [onSelect],
  );

  if (!isClient) return <div className="h-full bg-deep-panel" />;
  if (!nodes.length) return <EmptyHint />;

  const chrome = (
    <div
      className="clay-flow-chrome shrink-0 border-b border-border-smoke px-4 py-2.5"
      data-testid="flow-legend"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {findings.length ? (
            <ul className="mb-2 space-y-1" data-testid="flow-findings">
              {findings.map((f, i) => (
                <li
                  key={`${f.tone}-${i}-${f.text.slice(0, 40)}`}
                  className={[
                    "text-[13px] leading-[1.45]",
                    f.tone === "watch"
                      ? "text-ember-cta"
                      : f.tone === "ok"
                        ? "text-electric-current"
                        : "text-ash-text",
                  ].join(" ")}
                >
                  {f.tone === "watch" ? "Watch: " : f.tone === "ok" ? "Note: " : ""}
                  {f.text}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-[12px] text-ash-text">
              Left → right, then down. Click a node or use Play below to step
              {fullscreen ? " · Esc exits fullscreen" : ""}.
            </p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {LEGEND.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-1.5 text-[11px] text-fog-text"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!sqlCollapsed && onCollapseSql && !fullscreen ? (
            <Pressable
              type="button"
              onClick={onCollapseSql}
              className="btn-frost hidden items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-cloud-white sm:inline-flex"
              data-testid="flow-hide-sql"
              title="Hide SQL panel"
            >
              <PanelLeftClose size={15} strokeWidth={2} aria-hidden />
              Hide SQL
            </Pressable>
          ) : null}
          <Pressable
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="btn-frost inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-cloud-white"
            data-testid="flow-fullscreen"
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen flow"}
          >
            {fullscreen ? (
              <>
                <Minimize2 size={15} strokeWidth={2} aria-hidden />
                Exit
              </>
            ) : (
              <>
                <Maximize2 size={15} strokeWidth={2} aria-hidden />
                Fullscreen
              </>
            )}
          </Pressable>
        </div>
      </div>
    </div>
  );

  const canvas = (
    <div ref={paneRef} className="clay-flow-atmosphere min-h-0 flex-1">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelect(null, null)}
        nodesConnectable={false}
        onlyRenderVisibleElements
        minZoom={0.15}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        defaultEdgeOptions={{ style: { stroke: "#077ac7", strokeWidth: 2.8 } }}
      >
        <ViewportAnchor nodes={nodes} paneRef={paneRef} pane={pane} />
        <FocusSelected selectedId={selectedId} pane={pane} />
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1.2}
          color="#4a4258"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );

  const stepBar =
    stepFrames.length && onStepIndex && onStepPlaying && onStepSpeed ? (
      <StepControls
        frames={stepFrames}
        index={stepIndex}
        playing={stepPlaying}
        speed={stepSpeed}
        onIndex={onStepIndex}
        onPlaying={onStepPlaying}
        onSpeed={onStepSpeed}
      />
    ) : null;

  // Portal escapes GSAP transforms so fullscreen covers the real viewport.
  if (fullscreen) {
    return (
      <>
        <div className="h-full bg-deep-panel" aria-hidden />
        {createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-deep-panel"
            data-testid="flow-canvas"
            data-fullscreen="true"
            role="dialog"
            aria-modal="true"
            aria-label="Flow fullscreen"
          >
            {chrome}
            {canvas}
            {stepBar}
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col bg-deep-panel"
      data-testid="flow-canvas"
      data-fullscreen="false"
    >
      {chrome}
      {canvas}
      {stepBar}
    </div>
  );
}
