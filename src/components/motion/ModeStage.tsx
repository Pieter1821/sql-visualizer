"use client";

import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

export function ModeStage({
  mode,
  children,
}: {
  mode: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!root.current) return;
    if (prefersReducedMotion()) {
      gsap.set(root.current, { opacity: 1, y: 0, scale: 1 });
      return;
    }
    gsap.fromTo(
      root.current,
      { opacity: 0, y: 16, scale: 0.985 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.38,
        ease: "power3.out",
      },
    );
  }, { scope: root, dependencies: [mode] });

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
