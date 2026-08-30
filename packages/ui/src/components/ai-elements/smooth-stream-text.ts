"use client";

import { useEffect, useRef, useState } from "react";

const BASE_CPS = 42;
const MAX_CPS = 260;
const RAMP_CHARS = 96;
const DRAIN_AFTER = 140;
const DRAIN_FRACTION = 0.14;
const MAX_FRAME_MS = 48;

export function takeStreamChars(
  backlog: number,
  dtMs: number,
  remainder = 0,
): { count: number; remainder: number } {
  if (backlog <= 0) return { count: 0, remainder: 0 };
  const seconds = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS) / 1000;
  const t = Math.min(1, backlog / RAMP_CHARS);
  const cps = BASE_CPS + t * t * (MAX_CPS - BASE_CPS);
  let acc = remainder + cps * seconds;
  if (backlog > DRAIN_AFTER) {
    acc = Math.max(acc, backlog * DRAIN_FRACTION);
  }
  const count = Math.min(backlog, Math.floor(acc));
  return { count, remainder: acc - count };
}

export function nextStreamPrefix(target: string, shown: string, count: number): string {
  if (count <= 0 || shown === target) return shown;
  if (!target.startsWith(shown)) return target;
  let index = shown.length;
  let taken = 0;
  while (index < target.length && taken < count) {
    const codePoint = target.codePointAt(index);
    if (codePoint == null) break;
    index += codePoint > 0xffff ? 2 : 1;
    taken += 1;
  }
  return target.slice(0, index);
}

export function useSmoothStreamText(text: string, enabled: boolean): string {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(shown);
  const textRef = useRef(text);
  const remainderRef = useRef(0);
  shownRef.current = shown;
  textRef.current = text;

  useEffect(() => {
    if (!enabled) {
      remainderRef.current = 0;
      if (shownRef.current !== text) setShown(text);
      return;
    }
    if (shownRef.current === text) return;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const target = textRef.current;
      const current = shownRef.current;
      if (!target.startsWith(current)) {
        remainderRef.current = 0;
        setShown(target);
        return;
      }
      if (current === target) {
        remainderRef.current = 0;
        return;
      }
      const taken = takeStreamChars(
        target.length - current.length,
        now - last,
        remainderRef.current,
      );
      last = now;
      remainderRef.current = taken.remainder;
      if (taken.count > 0) {
        const next = nextStreamPrefix(target, current, taken.count);
        setShown(next);
        if (next !== target) {
          frame = requestAnimationFrame(tick);
          return;
        }
        remainderRef.current = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, text]);

  return enabled ? shown : text;
}
