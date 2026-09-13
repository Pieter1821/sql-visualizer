"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * True only after hydration. Used by DOM-measuring widgets (React Flow) and by
 * the shell's `data-hydrated` marker that end-to-end tests wait on.
 */
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
