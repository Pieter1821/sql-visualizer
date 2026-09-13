"use client";

import { Pressable } from "@/components/motion/Pressable";

export function ParsingState({ label = "Parsing SQL" }: { label?: string }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="google-border google-border-sm google-border-active w-full max-w-md p-5">
        <p className="text-[12px] uppercase tracking-[0.04em] text-fog-text">
          {label}
        </p>
        <div className="mt-4 space-y-2.5" aria-hidden>
          {[86, 62, 74, 48].map((w, i) => (
            <div
              key={w}
              className="loading-pulse h-3 rounded bg-muted-shell"
              style={{ width: `${w}%`, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ParseErrorState({
  message,
  line,
  onReveal,
}: {
  message: string;
  line?: number;
  onReveal?: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6" role="alert">
      <div className="max-w-md rounded-3xl border border-ember-scorch/60 bg-elevated-surface p-8">
        <p className="text-[12px] uppercase tracking-[0.04em] text-ember-scorch">
          Parse error
        </p>
        <p className="mt-2 text-[32px] font-light leading-[1.05] tracking-[-0.6px] text-cloud-white sm:text-[40px]">
          Could not read that SQL
        </p>
        <p className="mt-4 font-mono text-[13px] leading-[1.5] text-ash-text">
          {message}
          {line ? ` (line ${line})` : ""}
        </p>
        <p className="mt-4 text-[14px] leading-[1.5] text-fog-text">
          The parser is strict about dialect. Try switching the dialect in the
          navbar, or trim the batch down to one statement.
        </p>
        {onReveal && line ? (
          <Pressable
            type="button"
            onClick={onReveal}
            className="btn-ghost mt-6 rounded-lg px-5 py-2.5 text-[14px]"
          >
            Jump to line {line}
          </Pressable>
        ) : null}
      </div>
    </div>
  );
}
