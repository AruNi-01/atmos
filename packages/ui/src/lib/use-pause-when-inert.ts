"use client";

import { useEffect, useState, type RefObject } from "react";

/** Dispatched when Atmos flips workspace `data-tier` / inert without a React commit. */
export const SURFACE_VISUAL_EVENT = "atmos:surface-visual";

function isPausedFor(el: Element | null): boolean {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return true;
  }
  return Boolean(el?.closest("[inert]"));
}

export function usePauseWhenInert(hostRef: RefObject<HTMLElement | null>): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const sync = () => {
      setPaused(isPausedFor(hostRef.current));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    document.addEventListener(SURFACE_VISUAL_EVENT, sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener(SURFACE_VISUAL_EVENT, sync);
    };
  }, [hostRef]);
  return paused;
}
