"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { nextTreeRevealDelay } from "@/features/agent/lib/agent-tree-branch";

export function useSequentialReveal(count: number, enabled: boolean): number {
  const reduced = useReducedMotion();
  const skip = !enabled || Boolean(reduced);
  const [shown, setShown] = useState(() => (skip ? count : 0));

  useEffect(() => {
    if (skip) {
      setShown(count);
      return;
    }
    setShown((prev) => Math.min(Math.max(prev, 0), count));
  }, [skip, count]);

  useEffect(() => {
    if (skip || shown >= count) return;
    const delay = nextTreeRevealDelay(shown, count - shown);
    const timer = window.setTimeout(() => {
      setShown((prev) => Math.min(count, prev + 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [skip, shown, count]);

  return shown;
}
