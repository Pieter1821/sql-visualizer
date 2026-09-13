"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type UIEvent,
} from "react";
import { FolderOpen, PanelLeftClose } from "lucide-react";
import { tokenizeSql } from "@/lib/sql/tokenize";
import type { SqlRange } from "@/lib/sql/types";

export type SqlEditorHandle = {
  /** Scroll to and select a SQL range — used when a flow node is clicked. */
  focusRange: (range: SqlRange) => void;
};

type SqlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  highlight?: SqlRange | null;
  onCursorOffset?: (offset: number) => void;
  fileLabel?: string;
  onOpenFile?: (file: File) => void;
  /** Collapses the SQL column so the flow can use the full width. */
  onMinimize?: () => void;
};

const PLACEHOLDER = `-- Paste SQL here, open a .sql file, or drop one anywhere
SELECT Province, COUNT(*) AS Total
FROM Customers
WHERE Age >= 18
GROUP BY Province
HAVING COUNT(*) > 10;`;

function scrollToOffset(
  area: HTMLTextAreaElement,
  pre: HTMLPreElement | null,
  gutter: HTMLDivElement | null,
  offset: number,
  text: string,
) {
  const before = text.slice(0, Math.min(offset, text.length));
  const line = before.split("\n").length - 1;
  const lineHeight = 20;
  const target = Math.max(0, line * lineHeight - area.clientHeight / 2);
  area.scrollTop = target;
  if (pre) pre.scrollTop = target;
  if (gutter) gutter.scrollTop = target;
}

function Segment({ text, dim }: { text: string; dim: boolean }) {
  const tokens = useMemo(() => tokenizeSql(text), [text]);
  return (
    <span className={dim ? "sql-dim" : undefined}>
      {tokens.map((t, i) => (
        <span key={i} className={t.cls}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  function SqlEditor(
    {
      value,
      onChange,
      highlight,
      onCursorOffset,
      fileLabel = "query.sql",
      onOpenFile,
      onMinimize,
    },
    ref,
  ) {
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const lineCount = useMemo(() => value.split("\n").length, [value]);

    const parts = useMemo(() => {
      if (!highlight || highlight.end <= highlight.start) {
        return { head: value, active: "", tail: "" };
      }
      const start = Math.max(0, Math.min(highlight.start, value.length));
      const end = Math.max(start, Math.min(highlight.end, value.length));
      return {
        head: value.slice(0, start),
        active: value.slice(start, end),
        tail: value.slice(end),
      };
    }, [value, highlight]);

    useImperativeHandle(
      ref,
      () => ({
        focusRange(range: SqlRange) {
          const area = areaRef.current;
          if (!area) return;
          const start = Math.max(0, Math.min(range.start, value.length));
          const end = Math.max(start, Math.min(range.end, value.length));
          area.focus();
          area.setSelectionRange(start, end);
          scrollToOffset(area, preRef.current, gutterRef.current, start, value);
        },
      }),
      [value],
    );

    useEffect(() => {
      const area = areaRef.current;
      if (!area || !highlight) return;
      scrollToOffset(area, preRef.current, gutterRef.current, highlight.start, value);
    }, [highlight, value]);

    const syncScroll = (e: UIEvent<HTMLTextAreaElement>) => {
      const { scrollTop, scrollLeft } = e.currentTarget;
      if (preRef.current) {
        preRef.current.scrollTop = scrollTop;
        preRef.current.scrollLeft = scrollLeft;
      }
      if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
    };

    const reportCursor = () => {
      if (!onCursorOffset || !areaRef.current) return;
      onCursorOffset(areaRef.current.selectionStart);
    };

    return (
      <div
        className="clay-editor flex h-full min-h-0 flex-col"
        data-testid="sql-editor"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-t-[11px] border-b border-border-smoke bg-elevated-surface px-3">
          <span className="h-2 w-2 rounded-full bg-ember-scorch" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-ember-cta" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-electric-current" aria-hidden />
          <span className="ml-2 truncate font-mono text-[13px] leading-[1.4] text-fog-text">
            {fileLabel}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {onOpenFile ? (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn-frost flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-ash-text"
                  data-testid="open-file-button"
                >
                  <FolderOpen size={14} strokeWidth={2} aria-hidden />
                  Open
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".sql,.txt"
                  className="sr-only"
                  data-testid="open-file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onOpenFile(file);
                    e.target.value = "";
                  }}
                />
              </>
            ) : null}
            <span className="font-mono text-[12px] text-fog-text">
              {lineCount} {lineCount === 1 ? "line" : "lines"}
            </span>
            {onMinimize ? (
              <button
                type="button"
                onClick={onMinimize}
                className="btn-frost flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-ash-text"
                data-testid="minimize-sql"
                title="Hide SQL — give the flow the full width"
                aria-label="Minimize SQL editor"
              >
                <PanelLeftClose size={14} strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">Hide</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="sql-editor-body relative flex min-h-0 flex-1">
          <div
            ref={gutterRef}
            aria-hidden
            className="sql-gutter shrink-0 overflow-hidden border-r border-border-smoke bg-void-base py-4 text-right"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className="px-2 text-fog-text">
                {i + 1}
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <pre ref={preRef} aria-hidden className="sql-layer sql-paint">
              {value ? (
                <>
                  <Segment text={parts.head} dim={!!parts.active} />
                  {parts.active ? (
                    <mark className="sql-active">
                      <Segment text={parts.active} dim={false} />
                    </mark>
                  ) : null}
                  <Segment text={parts.tail} dim={!!parts.active} />
                </>
              ) : (
                <span className="sql-placeholder">{PLACEHOLDER}</span>
              )}
              {"\n"}
            </pre>

            <textarea
              ref={areaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={syncScroll}
              onKeyUp={reportCursor}
              onClick={reportCursor}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="SQL editor"
              className="sql-layer sql-input"
            />
          </div>
        </div>
      </div>
    );
  },
);
