"use client";

import { useEffect, useId, useState } from "react";
import { Pressable } from "@/components/motion/Pressable";
import { DIALECTS, type DialectId } from "@/lib/sql/dialects";
import { sourceStatus, type SqlSource } from "@/lib/sql/source";

type AppNavbarProps = {
  dialect: DialectId;
  onDialect: (id: DialectId) => void;
  dialectHint?: string;
  source: SqlSource;
  /** Omitted when there is nothing loaded, which hides the Clear control. */
  onClear?: () => void;
  onOpenStep?: () => void;
};

export function AppNavbar({
  dialect,
  onDialect,
  dialectHint,
  source,
  onClear,
  onOpenStep,
}: AppNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      data-shell="topnav"
      className="clay-chrome relative z-30 shrink-0 border-b border-border-smoke"
    >
      <nav
        aria-label="App"
        className="flex h-[66px] items-center gap-3 px-4 sm:gap-4 sm:px-6"
      >
        <p className="min-w-0 shrink text-[18px] font-light tracking-[-0.4px] text-cloud-white sm:text-[22px]">
          SQL Visualiser
        </p>

        <span
          className="btn-frost hidden min-w-0 truncate rounded-lg px-3 py-1 text-[12px] md:inline"
          title={sourceStatus(source)}
          data-testid="source-status"
        >
          {sourceStatus(source)}
        </span>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <label className="sr-only" htmlFor="sql-dialect">
            SQL dialect
          </label>
          <select
            id="sql-dialect"
            value={dialect}
            aria-label="SQL dialect"
            onChange={(e) => onDialect(e.target.value as DialectId)}
            className="hidden min-w-0 max-w-[36vw] rounded-lg border border-border-smoke bg-muted-shell px-2.5 py-2 text-[14px] text-ash-text outline-none sm:block sm:max-w-none"
          >
            {DIALECTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {dialectHint ? (
            <span
              className="hidden text-[12px] text-fog-text lg:inline"
              aria-live="polite"
            >
              {dialectHint}
            </span>
          ) : null}

          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="btn-frost hidden shrink-0 rounded-lg px-4 py-2.5 text-[14px] sm:inline-flex"
              data-testid="clear-button"
            >
              Clear
            </button>
          ) : null}

          <button
            type="button"
            className="btn-frost inline-flex h-10 w-10 items-center justify-center rounded-lg sm:ml-1"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            data-testid="hamburger-button"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <span aria-hidden className="flex w-4 flex-col gap-1">
              <span
                className={[
                  "h-0.5 w-full bg-cloud-white transition-transform",
                  menuOpen ? "translate-y-1.5 rotate-45" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "h-0.5 w-full bg-cloud-white transition-opacity",
                  menuOpen ? "opacity-0" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "h-0.5 w-full bg-cloud-white transition-transform",
                  menuOpen ? "-translate-y-1.5 -rotate-45" : "",
                ].join(" ")}
              />
            </span>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Navigation menu"
          className="absolute inset-x-0 top-full z-40 border-b border-border-smoke bg-elevated-surface"
          data-testid="nav-menu"
        >
          <div className="flex flex-col gap-1 px-4 py-4 sm:px-6">
            <p
              className="mb-2 text-[12px] uppercase tracking-[0.04em] text-fog-text md:hidden"
              data-testid="source-status-mobile"
            >
              {sourceStatus(source)}
            </p>

            <label className="sm:hidden">
              <span className="text-[12px] text-fog-text">SQL dialect</span>
              <select
                value={dialect}
                aria-label="SQL dialect mobile"
                onChange={(e) => onDialect(e.target.value as DialectId)}
                className="mt-1 w-full rounded-lg border border-border-smoke bg-muted-shell px-2.5 py-2 text-[14px] text-ash-text"
              >
                {DIALECTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            {onClear ? (
              <Pressable
                type="button"
                className="rounded-lg px-3 py-3 text-left text-[15px] text-cloud-white hover:bg-muted-shell"
                onClick={() => {
                  setMenuOpen(false);
                  onClear();
                }}
                data-testid="clear-button-menu"
              >
                Clear SQL
              </Pressable>
            ) : null}

            {onOpenStep ? (
              <Pressable
                type="button"
                className="rounded-lg px-3 py-3 text-left text-[15px] text-cloud-white hover:bg-muted-shell"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenStep();
                }}
              >
                Step through query
              </Pressable>
            ) : null}

            <a
              href="#site-footer"
              className="rounded-lg px-3 py-3 text-[15px] text-ash-text hover:bg-muted-shell"
              onClick={() => setMenuOpen(false)}
            >
              About &amp; safety
            </a>

            <div className="mt-2 rounded-xl bg-deep-panel p-3 text-[13px] leading-[1.5] text-fog-text">
              <p className="text-cloud-white">Keyboard</p>
              <p className="mt-1">
                Flow steps: Space · ← → / j k · R · 1–9
              </p>
              <p>Tabs: ← → Home End</p>
            </div>

            <button
              type="button"
              className="mt-2 self-start text-[13px] text-fog-text"
              onClick={() => setMenuOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
