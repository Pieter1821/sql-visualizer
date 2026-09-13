"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/gsap";

export function EmptyHint({ copy = "Paste SQL" }: { copy?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);

  useGSAP(() => {
    if (!text.current) return;
    if (prefersReducedMotion()) return;

    SplitText.create(text.current, {
      type: "chars",
      tag: "span",
      aria: "auto",
      autoSplit: true,
      onSplit(self) {
        gsap.set(self.chars, { display: "inline-block" });
        return gsap.from(self.chars, {
          y: 10,
          opacity: 0,
          stagger: 0.035,
          duration: 0.45,
          ease: "back.out(1.4)",
        });
      },
    });

    gsap.to(text.current, {
      y: -6,
      duration: 2.4,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: 0.5,
    });
  }, { scope: root, dependencies: [copy] });

  return (
    <div ref={root} className="flex h-full items-center justify-center px-6">
      <p
        ref={text}
        className="text-[40px] font-light leading-[0.94] tracking-[-0.86px] text-fog-text sm:text-[48px]"
      >
        {copy}
      </p>
    </div>
  );
}
