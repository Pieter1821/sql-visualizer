"use client";

import {
  forwardRef,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

type PressableProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  function Pressable(
    {
      children,
      className,
      disabled,
      onPointerDown,
      onPointerUp,
      onPointerEnter,
      onPointerLeave,
      onKeyDown,
      ...rest
    },
    forwardedRef,
  ) {
    const inner = useRef<HTMLButtonElement>(null);

    const press = () => {
      if (!inner.current || disabled || prefersReducedMotion()) return;
      gsap.to(inner.current, {
        scale: 0.96,
        duration: 0.1,
        ease: "power2.out",
        overwrite: "auto",
      });
    };

    const release = () => {
      if (!inner.current || prefersReducedMotion()) return;
      gsap.to(inner.current, {
        scale: 1,
        duration: 0.28,
        ease: "back.out(1.7)",
        overwrite: "auto",
      });
    };

    const enter = () => {
      if (!inner.current || disabled || prefersReducedMotion()) return;
      gsap.to(inner.current, {
        y: -1,
        duration: 0.18,
        overwrite: "auto",
      });
    };

    const leave = () => {
      if (!inner.current || prefersReducedMotion()) return;
      gsap.to(inner.current, {
        y: 0,
        scale: 1,
        duration: 0.2,
        overwrite: "auto",
      });
    };

    return (
      <button
        ref={(node) => {
          inner.current = node;
          assignRef(forwardedRef, node);
        }}
        disabled={disabled}
        className={className}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            press();
            window.setTimeout(release, 120);
          }
          onKeyDown?.(e);
        }}
        onPointerDown={(e) => {
          press();
          onPointerDown?.(e);
        }}
        onPointerUp={(e) => {
          release();
          onPointerUp?.(e);
        }}
        onPointerEnter={(e) => {
          enter();
          onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          leave();
          onPointerLeave?.(e);
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
