"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { HOST_RESIZE_DRAG_ATTR } from "@/features/terminal/lib/host-resize-pin";

/**
 * Keep splitter geometry on a local rAF tree while the pointer is down.
 * Persist / parent store updates only happen in `commitLiveResize`.
 */
export function useLiveSplitLayout<T>(source: T) {
  const [live, setLive] = useState(source);
  const liveRef = useRef(source);
  const resizingRef = useRef(false);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    if (resizingRef.current) return;
    liveRef.current = source;
    setLive(source);
  }, [source]);

  useEffect(
    () => () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      if (resizingRef.current && typeof document !== "undefined") {
        document.documentElement.removeAttribute(HOST_RESIZE_DRAG_ATTR);
      }
    },
    [],
  );

  const publishLive = useCallback((next: T) => {
    liveRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setLive(liveRef.current);
    });
  }, []);

  const beginLiveResize = useCallback(() => {
    resizingRef.current = true;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(HOST_RESIZE_DRAG_ATTR, "");
    }
  }, []);

  const commitLiveResize = useCallback((commit: (next: T) => void) => {
    resizingRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setLive(liveRef.current);
    commit(liveRef.current);
    // Drop the drag flag after paint so xterm/PTY flush against the new box.
    requestAnimationFrame(() => {
      if (typeof document !== "undefined") {
        document.documentElement.removeAttribute(HOST_RESIZE_DRAG_ATTR);
      }
    });
  }, []);

  return { live, liveRef, beginLiveResize, publishLive, commitLiveResize };
}
