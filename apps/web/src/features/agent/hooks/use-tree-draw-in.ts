"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Start undrawn, then flip on the next frame so stroke-dashoffset can ease.
 * Replays when `skip` goes from true → false (collapsed group opened).
 */
export function useTreeDrawIn(skip: boolean): boolean {
  const skipRef = useRef(skip);
  const drawnRef = useRef(skip);
  const [tick, setTick] = useState(0);

  if (skipRef.current !== skip) {
    skipRef.current = skip;
    drawnRef.current = skip;
  }

  useLayoutEffect(() => {
    if (skip || drawnRef.current) return;
    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        drawnRef.current = true;
        setTick((value) => value + 1);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [skip, tick]);

  return skip || drawnRef.current;
}
