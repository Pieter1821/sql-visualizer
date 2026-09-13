"use client";

import { useRef } from "react";
import { EmptyHint } from "@/components/motion/EmptyHint";
import { Pressable } from "@/components/motion/Pressable";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import type { VisualModel } from "@/lib/sql/types";
import {
  pipelineFromModel,
  scoreCards,
  staticFindings,
} from "@/lib/sql/explain";

export function ScorePanel({ sql, model }: { sql: string; model: VisualModel }) {
  const root = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);

  const cards = model.nodes.length ? scoreCards(sql, model) : [];
  const findings = model.nodes.length ? staticFindings(sql, model) : [];
  const overall = cards.length
    ? Math.round(cards.reduce((s, c) => s + c.value, 0) / cards.length)
    : 0;

  useGSAP(
    () => {
      if (!model.nodes.length) return;
      const reduce = prefersReducedMotion();
      const obj = { n: 0 };
      gsap.to(obj, {
        n: overall,
        duration: reduce ? 0 : 0.75,
        ease: "power2.out",
        onUpdate() {
          if (scoreRef.current) {
            scoreRef.current.textContent = String(Math.round(obj.n));
          }
        },
      });
      gsap.from("[data-score-card]", {
        y: 18,
        opacity: 0,
        stagger: 0.07,
        duration: reduce ? 0 : 0.42,
        ease: "power3.out",
      });
      gsap.fromTo(
        "[data-score-bar]",
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: "left center",
          stagger: 0.07,
          duration: reduce ? 0 : 0.58,
          ease: "power3.out",
        },
      );
      gsap.from("[data-finding]", {
        x: -10,
        opacity: 0,
        stagger: 0.05,
        duration: reduce ? 0 : 0.34,
        delay: reduce ? 0 : 0.12,
      });
    },
    { scope: root, dependencies: [sql, overall, model.nodes.length] },
  );

  if (!model.nodes.length) return <EmptyHint />;

  return (
    <div ref={root} className="h-full overflow-y-auto p-4 sm:p-6">
      <p className="text-[12px] font-medium uppercase tracking-[0.05em] text-fog-text">
        Static analysis
      </p>
      <p className="mt-2 text-[48px] font-light leading-[0.94] tracking-[-0.86px] text-cloud-white">
        <span ref={scoreRef}>0</span>
        <span className="ml-2 text-[16px] font-normal tracking-normal text-fog-text">
          / 100
        </span>
      </p>
      <p className="mt-3 text-[16px] text-ash-text">
        From the text only. No plan, no runtime.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.label}
            data-score-card
            className="rounded-2xl bg-elevated-surface p-6"
          >
            <p className="text-[12px] text-fog-text">{card.label}</p>
            <p className="mt-1 text-[20px] leading-[1.25] text-cloud-white">
              {card.value}
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-lg bg-muted-shell">
              <div
                data-score-bar
                className="h-full bg-electric-current"
                style={{ width: `${card.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-6 space-y-2">
        {findings.map((f, i) => (
          <li
            key={`${f.tone}-${i}-${f.text.slice(0, 40)}`}
            data-finding
            className="rounded-3xl border border-white/15 bg-elevated-surface px-4 py-3 text-[14px] leading-[1.5] text-ash-text"
          >
            <span className="mr-2 text-[12px] font-medium text-fog-text">
              {f.tone === "watch" ? "Watch" : f.tone === "ok" ? "Note" : "Read"}
            </span>
            {f.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PipelinePanel({
  model,
  sql,
  onPick,
}: {
  model: VisualModel;
  sql: string;
  onPick: (nodeId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!model.nodes.length) return;
      const reduce = prefersReducedMotion();
      gsap.from("[data-pipe-stage]", {
        y: 20,
        opacity: 0,
        stagger: 0.06,
        duration: reduce ? 0 : 0.4,
        ease: "power3.out",
      });
      gsap.from("[data-pipe-arrow]", {
        opacity: 0,
        scale: 0.6,
        stagger: 0.06,
        duration: reduce ? 0 : 0.28,
        delay: reduce ? 0 : 0.08,
        ease: "back.out(1.8)",
      });
    },
    { scope: root, dependencies: [sql, model.nodes.length] },
  );

  if (!model.nodes.length) return <EmptyHint />;
  const stages = pipelineFromModel(model, sql);

  return (
    <div
      ref={root}
      className="flex h-full flex-col items-center justify-center overflow-y-auto px-4 py-8"
    >
      <p className="mb-6 text-[12px] font-medium uppercase tracking-[0.05em] text-fog-text">
        Logical order — not the order you typed it
      </p>
      <ol className="w-full max-w-sm">
        {stages.map((stage, i) => (
          <li key={stage.id} className="flex flex-col items-center">
            <Pressable
              type="button"
              data-pipe-stage
              disabled={!stage.present}
              onClick={() => stage.nodeId && onPick(stage.nodeId)}
              className={[
                "w-full rounded-2xl px-4 py-3 text-left text-[16px]",
                stage.present
                  ? "bg-elevated-surface text-cloud-white"
                  : "bg-muted-shell text-fog-text",
              ].join(" ")}
            >
              {stage.label}
              <span className="float-right text-[12px] font-medium text-fog-text">
                {stage.present ? "in this SQL" : "absent"}
              </span>
            </Pressable>
            {i < stages.length - 1 ? (
              <span data-pipe-arrow className="py-1 text-ash-text">
                ↓
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
