"use client";

import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReactFlowProvider, type Node } from "@xyflow/react";
import { PanelLeftOpen } from "lucide-react";
import { ModeStage } from "@/components/motion/ModeStage";
import { Pressable } from "@/components/motion/Pressable";
import { AppNavbar } from "@/components/workspace/AppNavbar";
import { PipelinePanel, ScorePanel } from "@/components/workspace/AnalysisPanels";
import { FlowCanvas } from "@/components/workspace/FlowCanvas";
import { SiteFooter } from "@/components/workspace/SiteFooter";
import { SqlEditor, type SqlEditorHandle } from "@/components/workspace/SqlEditor";
import type { SqlNodeData } from "@/components/workspace/SqlNode";
import { ParseErrorState, ParsingState } from "@/components/workspace/StateViews";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { type DialectId } from "@/lib/sql/dialects";
import { explainNode, nodeAtOffset } from "@/lib/sql/explain";
import { topFindings } from "@/lib/sql/findings";
import { parseSqlToVisualModel } from "@/lib/sql/parse";
import { readLocalSqlFile, type SqlSource } from "@/lib/sql/source";
import { buildStepTimeline, type PlaySpeed } from "@/lib/sql/step-engine";
import type { SqlRange, VisualNode } from "@/lib/sql/types";
import { useIsClient } from "@/lib/use-is-client";

type Mode = "flow" | "score" | "pipeline";
type Pane = "sql" | "map";

const MODES: { id: Mode; label: string }[] = [
  { id: "flow", label: "Flow" },
  { id: "score", label: "Score" },
  { id: "pipeline", label: "Pipeline" },
];

export function WorkspaceApp() {
  const [sql, setSql] = useState("");
  const [dialect, setDialect] = useState<DialectId>("auto");
  const [mode, setMode] = useState<Mode>("flow");
  const [pane, setPane] = useState<Pane>("sql");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualHighlight, setManualHighlight] = useState<SqlRange | null>(null);
  const [depth, setDepth] = useState<"simple" | "dev">("simple");
  const [dragging, setDragging] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>(1);
  const [source, setSource] = useState<SqlSource>({
    kind: "empty",
    label: "This tab only",
  });
  /** When true the SQL column is hidden so Flow can use the full width. */
  const [sqlCollapsed, setSqlCollapsed] = useState(false);

  const shell = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const explainRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const editorRef = useRef<SqlEditorHandle>(null);

  const hydrated = useIsClient();

  // Deferred parse keeps typing responsive and gives us an honest loading state.
  const deferredSql = useDeferredValue(sql);
  const parsing = deferredSql !== sql;

  const model = useMemo(
    () => parseSqlToVisualModel(deferredSql, dialect),
    [deferredSql, dialect],
  );

  const frames = useMemo(
    () => buildStepTimeline(model, deferredSql),
    [model, deferredSql],
  );

  // The timeline can shrink while the index is stale, so clamp on read.
  const safeIndex = frames.length ? Math.min(stepIndex, frames.length - 1) : 0;

  // Selection is shared: Play / Prev / Next and card clicks all update selectedId.
  const highlight = manualHighlight;
  const activeNodeId = selectedId;

  const selected: VisualNode | null = useMemo(
    () => model.nodes.find((n) => n.id === activeNodeId) ?? null,
    [model.nodes, activeNodeId],
  );

  const explain = selected ? explainNode(selected, model) : null;

  const flowFindings = useMemo(
    () => (deferredSql.trim() ? topFindings(deferredSql, model, 3) : []),
    [deferredSql, model],
  );

  const focusNode = useCallback(
    (node: VisualNode | null) => {
      if (!node) return;
      setSelectedId(node.id);
      setManualHighlight(node.sqlRange ?? null);
      const frameIdx = frames.findIndex((f) => f.nodeId === node.id);
      if (frameIdx >= 0) setStepIndex(frameIdx);
      if (node.sqlRange) {
        editorRef.current?.focusRange(node.sqlRange);
        if (typeof window !== "undefined" && window.innerWidth < 1024) {
          setPane("sql");
        }
      }
    },
    [frames],
  );

  const goStep = useCallback(
    (index: number) => {
      if (!frames.length) return;
      const next = Math.max(0, Math.min(frames.length - 1, index));
      setStepIndex(next);
      const frame = frames[next];
      if (!frame) return;
      setSelectedId(frame.nodeId);
      setManualHighlight(frame.sqlRange ?? null);
      if (frame.sqlRange) editorRef.current?.focusRange(frame.sqlRange);
    },
    [frames],
  );

  const onSelect = useCallback(
    (id: string | null, node: Node | null) => {
      if (!id || !node) {
        setSelectedId(null);
        setManualHighlight(null);
        return;
      }
      const data = node.data as SqlNodeData | undefined;
      const hit = model.nodes.find((n) => n.id === id) ?? null;
      if (hit) focusNode(hit);
      else {
        setSelectedId(id);
        setManualHighlight(data?.sqlRange ?? null);
      }
    },
    [focusNode, model.nodes],
  );

  const onSqlChange = useCallback((next: string) => {
    setSql(next);
    setSelectedId(null);
    setManualHighlight(null);
    setPlaying(false);
    setSource((prev) => {
      if (!next.trim()) return { kind: "empty", label: "This tab only" };
      if (prev.kind === "file" || prev.kind === "paste") {
        return { ...prev, edited: true };
      }
      return { kind: "typed", label: "Editor" };
    });
  }, []);

  const loadSql = useCallback((text: string, next: SqlSource) => {
    setSql(text);
    setSource(next);
    setSelectedId(null);
    setManualHighlight(null);
    setStepIndex(0);
    setPlaying(false);
    setMode("flow");
    setPane("map");
  }, []);

  const clearAll = useCallback(() => {
    setSql("");
    setSource({ kind: "empty", label: "This tab only" });
    setSelectedId(null);
    setManualHighlight(null);
    setStepIndex(0);
    setPlaying(false);
    setMode("flow");
    setPane("sql");
  }, []);

  const takeDroppedFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const next = await readLocalSqlFile(file);
        loadSql(next.text, {
          kind: "file",
          label: next.name,
          bytes: next.bytes,
          encoding: next.encoding,
        });
      } catch {
        /* drag rejected — file type or size; editor stays as-is */
      }
    },
    [loadSql],
  );

  const onCursor = useCallback(
    (offset: number) => {
      if (playing) return;
      const hit = nodeAtOffset(model.nodes, offset);
      if (hit) {
        setSelectedId(hit.id);
        setManualHighlight(hit.sqlRange ?? null);
        const frameIdx = frames.findIndex((f) => f.nodeId === hit.id);
        if (frameIdx >= 0) setStepIndex(frameIdx);
      }
    },
    [model.nodes, playing, frames],
  );

  const pickPipeline = (nodeId: string) => {
    const node = model.nodes.find((n) => n.id === nodeId) ?? null;
    setMode("flow");
    setSelectedId(node?.id ?? null);
    setManualHighlight(node?.sqlRange ?? null);
    setPane("map");
  };

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % MODES.length;
    if (e.key === "ArrowLeft") next = (index - 1 + MODES.length) % MODES.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = MODES.length - 1;
    setMode(MODES[next].id);
    tabRefs.current[next]?.focus();
  };

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-shell='topnav']", { y: -14, opacity: 0, duration: 0.42 }).from(
        "[data-mode-tab]",
        { y: 8, opacity: 0, stagger: 0.045, duration: 0.3 },
        "-=0.22",
      );
    },
    { scope: shell },
  );

  useGSAP(
    () => {
      const nav = navRef.current;
      const ink = inkRef.current;
      const active = nav?.querySelector(
        "[data-mode-active='true']",
      ) as HTMLElement | null;
      if (!nav || !ink || !active) return;
      const navBox = nav.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      gsap.to(ink, {
        x: box.left - navBox.left + nav.scrollLeft,
        width: box.width,
        duration: prefersReducedMotion() ? 0 : 0.34,
        ease: "power3.out",
      });
    },
    { scope: navRef, dependencies: [mode] },
  );

  useGSAP(
    () => {
      if (!explainRef.current) return;
      if (prefersReducedMotion()) {
        gsap.set(explainRef.current, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        explainRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.32, ease: "power3.out" },
      );
    },
    { dependencies: [selected?.id, explain?.title] },
  );

  const parseError = model.error;
  const showInspector = mode === "flow" && !!explain;

  const renderPanel = () => {
    if (parsing) return <ParsingState />;
    if (parseError) {
      return (
        <ParseErrorState message={parseError.message} line={parseError.line} />
      );
    }
    if (mode === "score") return <ScorePanel sql={deferredSql} model={model} />;
    if (mode === "pipeline") {
      return <PipelinePanel sql={deferredSql} model={model} onPick={pickPipeline} />;
    }
    return (
      <ReactFlowProvider>
        <FlowCanvas
          model={model}
          selectedId={selected?.id ?? selectedId}
          onSelect={onSelect}
          findings={flowFindings}
          sqlCollapsed={sqlCollapsed}
          onCollapseSql={() => {
            setSqlCollapsed(true);
            setPane("map");
          }}
          stepFrames={frames}
          stepIndex={safeIndex}
          stepPlaying={playing && frames.length > 0}
          stepSpeed={speed}
          onStepIndex={goStep}
          onStepPlaying={setPlaying}
          onStepSpeed={setSpeed}
        />
      </ReactFlowProvider>
    );
  };

  return (
    <div
      ref={shell}
      data-hydrated={hydrated}
      className="bg-void relative grid h-[100dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] overflow-hidden text-ash-text"
      onDragEnter={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as globalThis.Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void takeDroppedFile(e.dataTransfer.files[0]);
      }}
    >
      <a href="#main-workspace" className="skip-link">
        Skip to workspace
      </a>

      <AppNavbar
        dialect={dialect}
        onDialect={setDialect}
        dialectHint={
          model.dialectUsed
            ? model.kind === "heuristic"
              ? "heuristic"
              : model.dialectUsed
            : undefined
        }
        source={source}
        onClear={sql.trim() ? clearAll : undefined}
        onOpenStep={
          frames.length
            ? () => {
                setMode("flow");
                setPlaying(true);
                goStep(safeIndex);
              }
            : undefined
        }
      />

      <div className="flex shrink-0 flex-col gap-3 border-b border-border-smoke bg-void-base px-4 py-3 sm:px-6">
        <nav
          ref={navRef}
          className="relative -mx-1 flex gap-4 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Analysis views"
        >
          <span
            ref={inkRef}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-px bg-electric-current"
            style={{ width: 0 }}
          />
          {MODES.map((m, i) => (
            <Pressable
              key={m.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${m.id}`}
              aria-selected={mode === m.id}
              aria-controls={`panel-${m.id}`}
              tabIndex={mode === m.id ? 0 : -1}
              data-mode-tab
              data-mode-active={mode === m.id}
              data-testid={`tab-${m.id}`}
              onClick={() => setMode(m.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={[
                "relative shrink-0 pb-1 text-[14px]",
                mode === m.id ? "text-cloud-white" : "text-fog-text",
              ].join(" ")}
            >
              {m.label}
            </Pressable>
          ))}
        </nav>

        <div className="flex gap-2 lg:hidden" role="group" aria-label="Pane">
          {(
            [
              ["sql", "SQL"],
              ["map", "Map"],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              type="button"
              aria-pressed={pane === id}
              onClick={() => setPane(id)}
              className={[
                "flex-1 rounded-lg py-2 text-[14px]",
                pane === id ? "btn-frost text-cloud-white" : "text-fog-text",
              ].join(" ")}
            >
              {label}
            </Pressable>
          ))}
        </div>
      </div>

      <main
        id="main-workspace"
        className="flex min-h-0 flex-col overflow-hidden lg:flex-row"
      >
        {sqlCollapsed ? (
          <aside
            className="hidden shrink-0 border-r border-border-smoke bg-void-base lg:flex lg:w-12 lg:flex-col lg:items-center lg:gap-2 lg:py-3"
            aria-label="SQL panel collapsed"
          >
            <button
              type="button"
              onClick={() => {
                setSqlCollapsed(false);
                setPane("sql");
              }}
              className="btn-frost flex flex-col items-center gap-2 rounded-lg px-2 py-3 text-cloud-white"
              data-testid="expand-sql"
              title="Show SQL editor"
              aria-label="Show SQL editor"
            >
              <PanelLeftOpen size={16} strokeWidth={2} aria-hidden />
              <span className="text-[10px] font-medium tracking-[0.14em] uppercase [writing-mode:vertical-rl]">
                SQL
              </span>
            </button>
          </aside>
        ) : (
          <section
            className={[
              "min-h-0 border-border-smoke bg-void-base p-2 lg:w-[38%] lg:border-r lg:p-3",
              pane === "sql"
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden lg:flex lg:min-h-0 lg:flex-col",
            ].join(" ")}
            aria-label="SQL source"
          >
            <div className="min-h-0 flex-1">
              <SqlEditor
                ref={editorRef}
                value={sql}
                onChange={onSqlChange}
                highlight={highlight}
                onCursorOffset={onCursor}
                fileLabel={source.kind === "file" ? source.label : "query.sql"}
                onOpenFile={(file) => void takeDroppedFile(file)}
                onMinimize={() => {
                  setSqlCollapsed(true);
                  setPane("map");
                }}
              />
            </div>
          </section>
        )}

        <section
          id={`panel-${mode}`}
          role="tabpanel"
          aria-labelledby={`tab-${mode}`}
          className={[
            "min-h-0 flex-1 bg-deep-panel",
            pane === "map" || sqlCollapsed
              ? "flex flex-col"
              : "hidden lg:flex lg:flex-col",
          ].join(" ")}
          data-testid="map-panel"
        >
          <ModeStage mode={`${mode}:${pane}:${parsing ? "load" : "ready"}:${sqlCollapsed ? "wide" : "split"}`}>
            {renderPanel()}
          </ModeStage>
        </section>
      </main>

      <div
        data-shell="debug"
        className="shrink-0 border-t border-border-smoke bg-elevated-surface"
        aria-label="Status"
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <span
            className="text-[12px] text-fog-text"
            aria-live="polite"
            data-testid="stats"
          >
            {parsing
              ? "Parsing…"
              : [
                  `${model.stats.tables} reads`,
                  `${model.stats.joins} joins`,
                  `${model.stats.filters} filters`,
                  model.stats.ctes ? `${model.stats.ctes} CTEs` : "",
                  model.stats.windows ? `${model.stats.windows} windows` : "",
                  model.stats.subqueries ? `${model.stats.subqueries} subqueries` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
            {!parsing && model.warning ? ` · ${model.warning}` : ""}
          </span>
          {frames.length && mode === "flow" && !playing ? (
            <Pressable
              type="button"
              onClick={() => {
                setPlaying(true);
                goStep(safeIndex);
              }}
              className="btn-ember ml-auto rounded-lg px-4 py-1.5 text-[13px]"
              data-testid="open-step"
            >
              Play steps
            </Pressable>
          ) : null}
        </div>

        {showInspector ? (
          <div className="max-h-[16vh] overflow-y-auto px-4 pb-3 sm:px-6">
            <div
              ref={explainRef}
              className="clay-inspector px-5 py-4"
              data-testid="inspector"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.04em] text-fog-text">
                    {selected?.kind}
                  </p>
                  <p className="mt-1 text-[20px] leading-[1.25] text-cloud-white">
                    {explain?.title}
                  </p>
                </div>
                <div className="flex gap-3" role="group" aria-label="Explain depth">
                  <Pressable
                    type="button"
                    aria-pressed={depth === "simple"}
                    onClick={() => setDepth("simple")}
                    className={
                      depth === "simple"
                        ? "text-[14px] text-cloud-white"
                        : "text-[14px] text-fog-text"
                    }
                  >
                    Plain
                  </Pressable>
                  <Pressable
                    type="button"
                    aria-pressed={depth === "dev"}
                    onClick={() => setDepth("dev")}
                    className={
                      depth === "dev"
                        ? "text-[14px] text-cloud-white"
                        : "text-[14px] text-fog-text"
                    }
                  >
                    Dev
                  </Pressable>
                </div>
              </div>
              <p className="mt-2 text-[16px] leading-[1.5] text-ash-text">
                {depth === "simple" ? explain?.simple : explain?.developer}
              </p>
              {explain?.condition && depth === "dev" ? (
                <p className="mt-2 font-mono text-[13px] leading-[1.4] text-fog-text">
                  {explain.condition}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <SiteFooter />

      {dragging ? (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-void-base/80"
          role="status"
          aria-live="assertive"
        >
          <p className="text-[48px] font-light leading-[0.94] tracking-[-0.86px] text-cloud-white">
            Drop SQL here
          </p>
        </div>
      ) : null}
    </div>
  );
}
