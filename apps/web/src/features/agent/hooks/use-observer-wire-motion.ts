"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  beginObserverWireMotion,
  layoutMotionKey,
  sampleObserverWireMotion,
  type ObserverWireFrame,
  type ObserverWireMotion,
  type WirePoint,
} from "@/features/agent/lib/observer-wire-motion";

export function useObserverWireMotion(
  targets: Map<string, WirePoint>,
  heights: Map<string, number>,
): ObserverWireFrame {
  const motionRef = useRef<ObserverWireMotion | null>(null);
  const targetsRef = useRef(targets);
  const heightsRef = useRef(heights);
  targetsRef.current = targets;
  heightsRef.current = heights;
  const [frame, setFrame] = useState<ObserverWireFrame>(() => ({
    positions: new Map(targets),
    boxHeights: new Map(),
  }));
  const key = layoutMotionKey(targets, heights);

  useLayoutEffect(() => {
    const now = performance.now();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const current = motionRef.current
      ? sampleObserverWireMotion(motionRef.current, now).baseline
      : null;
    const next = beginObserverWireMotion({
      current,
      targets: targetsRef.current,
      heights: heightsRef.current,
      reduced,
      now,
    });
    motionRef.current = next;
    setFrame(sampleObserverWireMotion(next, now).frame);
    if (next.duration <= 0) return;
    let raf = 0;
    const tick = (time: number) => {
      const motion = motionRef.current;
      if (!motion || motion !== next) return;
      const sampled = sampleObserverWireMotion(motion, time);
      setFrame(sampled.frame);
      if (time - motion.start < motion.duration)
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);

  return frame;
}
