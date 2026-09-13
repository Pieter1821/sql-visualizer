"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pressable } from "@/components/motion/Pressable";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import {
  PLAY_SPEEDS,
  stepDurationMs,
  type PlaySpeed,
  type StepFrame,
} from "@/lib/sql/step-engine";

type StepControlsProps = {
  frames: StepFrame[];
  index: number;
  playing: boolean;
  speed: PlaySpeed;
  onIndex: (index: number) => void;
  onPlaying: (playing: boolean) => void;
  onSpeed: (speed: PlaySpeed) => void;
};

export function StepControls({
  frames,
  index,
  playing,
  speed,
  onIndex,
  onPlaying,
  onSpeed,
}: StepControlsProps) {
  const frame = frames[index] ?? null;
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const reduce = prefersReducedMotion();

  const progress = frames.length <= 1 ? 1 : index / (frames.length - 1);

  useLayoutEffect(() => {
    const fill = fillRef.current;
    const thumb = thumbRef.current;
    if (!fill || !thumb) return;
    if (reduce || dragging) {
      gsap.set(fill, { width: `${progress * 100}%` });
      gsap.set(thumb, { left: `${progress * 100}%` });
      return;
    }
    gsap.to(fill, {
      width: `${progress * 100}%`,
      duration: 0.34,
      ease: "power3.out",
      overwrite: "auto",
    });
    gsap.to(thumb, {
      left: `${progress * 100}%`,
      duration: 0.34,
      ease: "power3.out",
      overwrite: "auto",
    });
  }, [progress, reduce, dragging]);

  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb || reduce) return;
    gsap.to(thumb, {
      scale: dragging ? 1.25 : 1,
      duration: 0.18,
      ease: "power2.out",
      overwrite: "auto",
    });
  }, [dragging, reduce]);

  const go = useCallback(
    (n: number) => {
      onIndex(Math.max(0, Math.min(frames.length - 1, n)));
    },
    [frames.length, onIndex],
  );

  const togglePlay = useCallback(() => {
    if (!frames.length) return;
    if (index >= frames.length - 1 && !playing) {
      onIndex(0);
      onPlaying(true);
      return;
    }
    onPlaying(!playing);
  }, [frames.length, index, playing, onIndex, onPlaying]);

  useEffect(() => {
    if (!playing || !frames.length || dragging) return;
    const ms = reduce ? 600 : stepDurationMs(speed);
    const t = window.setTimeout(() => {
      if (index >= frames.length - 1) {
        onPlaying(false);
        return;
      }
      onIndex(index + 1);
    }, ms);
    return () => window.clearTimeout(t);
  }, [playing, index, speed, frames.length, dragging, reduce, onIndex, onPlaying]);

  useEffect(() => {
    if (!frames.length) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        onPlaying(false);
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        onPlaying(false);
        go(index - 1);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onPlaying(false);
        go(0);
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        onPlaying(false);
        go(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames.length, index, onPlaying, go, togglePlay]);

  const scrubFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || frames.length < 2) return;
    const box = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    go(Math.round(ratio * (frames.length - 1)));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    setDragging(true);
    onPlaying(false);
    scrubFromClientX(e.clientX);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    scrubFromClientX(e.clientX);
  };

  const onPointerUp = () => setDragging(false);

  if (!frames.length || !frame) return null;

  return (
    <div
      className="clay-stepbar shrink-0 border-t border-border-smoke px-4 py-3 sm:px-5"
      aria-label="Step timeline"
      data-testid="step-through"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-cloud-white">
          Step {index + 1} of {frames.length}
          <span className="ml-2 text-fog-text">· {frame.title}</span>
        </p>
        <p className="font-mono text-[12px] leading-snug break-words text-ash-text">
          {frame.sqlSnippet}
        </p>
      </div>

      <div
        ref={trackRef}
        className="relative mx-auto mt-3 h-8 max-w-3xl cursor-pointer touch-none"
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={frames.length}
        aria-valuenow={index + 1}
        aria-valuetext={`Step ${index + 1}: ${frame.title}`}
        aria-label="Scrub timeline"
        data-testid="step-timeline"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(index + 1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(index - 1);
          }
          if (e.key === "Home") {
            e.preventDefault();
            go(0);
          }
          if (e.key === "End") {
            e.preventDefault();
            go(frames.length - 1);
          }
        }}
      >
        <div className="clay-track absolute top-1/2 right-0 left-0 h-3 -translate-y-1/2 rounded-full" />
        <div
          ref={fillRef}
          className="clay-track-fill absolute top-1/2 left-0 h-3 -translate-y-1/2 rounded-full"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          ref={thumbRef}
          className="clay-thumb absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-2 sm:gap-3">
        <Pressable
          type="button"
          className="btn-clay rounded-xl px-3 py-2 text-[13px]"
          onClick={() => {
            onPlaying(false);
            go(index - 1);
          }}
          disabled={index <= 0}
          data-testid="prev-step"
          aria-label="Previous step"
        >
          ◀ Prev
        </Pressable>
        <Pressable
          type="button"
          className="btn-clay-play rounded-2xl px-6 py-2.5 text-[14px] font-semibold"
          onClick={() => togglePlay()}
          data-testid="play-step"
          aria-label={playing ? "Pause" : "Play automatically"}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </Pressable>
        <Pressable
          type="button"
          className="btn-clay rounded-xl px-3 py-2 text-[13px]"
          onClick={() => {
            onPlaying(false);
            go(index + 1);
          }}
          disabled={index >= frames.length - 1}
          data-testid="next-step"
          aria-label="Next step"
        >
          Next ▶
        </Pressable>
        <Pressable
          type="button"
            className="btn-clay rounded-xl px-3 py-2 text-[13px] text-fog-text"
          onClick={() => {
            onPlaying(false);
            go(0);
          }}
          aria-label="Restart"
          data-testid="restart-step"
        >
          ↶ Restart
        </Pressable>

        <div
          className="flex flex-wrap gap-1 sm:ml-2"
          role="group"
          aria-label="Playback speed"
        >
          {PLAY_SPEEDS.map((s) => (
            <Pressable
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => onSpeed(s)}
              className={[
                "rounded-lg px-2.5 py-1 text-[12px]",
                speed === s
                  ? "clay-speed-active text-cloud-white"
                  : "text-fog-text",
              ].join(" ")}
            >
              {s}x
            </Pressable>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[12px] text-fog-text">
        Space play/pause · ← → or j/k step · R restart · 1–9 jump
      </p>
    </div>
  );
}
