"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { create } from "zustand";

import {
  CENTER_STAGE_FULLSCREEN_ATTR,
} from "@/app-shell/center-stage-fullscreen";

type CenterStageFullscreenState = {
  isFullscreen: boolean;
  paneId: string | null;
  setFullscreen: (next: boolean, paneId?: string | null) => void;
  toggleFullscreen: (paneId?: string | null) => void;
};

export const useCenterStageFullscreenStore = create<CenterStageFullscreenState>((set) => ({
  isFullscreen: false,
  paneId: null,
  setFullscreen: (next, paneId) =>
    set(
      next
        ? { isFullscreen: true, paneId: paneId ?? null }
        : { isFullscreen: false, paneId: null },
    ),
  toggleFullscreen: (paneId) =>
    set((state) =>
      state.isFullscreen
        ? { isFullscreen: false, paneId: null }
        : { isFullscreen: true, paneId: paneId ?? state.paneId },
    ),
}));

function markFullscreen(element: HTMLElement, active: boolean): void {
  if (active) {
    element.setAttribute(CENTER_STAGE_FULLSCREEN_ATTR, "");
    element.setAttribute("data-atmos-browser-surface-overlay", "true");
    document.documentElement.setAttribute(CENTER_STAGE_FULLSCREEN_ATTR, "");
    return;
  }
  element.removeAttribute(CENTER_STAGE_FULLSCREEN_ATTR);
  element.removeAttribute("data-atmos-browser-surface-overlay");
  document.documentElement.removeAttribute(CENTER_STAGE_FULLSCREEN_ATTR);
}

export function useCenterStageFullscreenMotion(
  stageRef: RefObject<HTMLElement | null>,
): void {
  const isFullscreen = useCenterStageFullscreenStore((state) => state.isFullscreen);
  const setFullscreen = useCenterStageFullscreenStore((state) => state.setFullscreen);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) {
      if (isFullscreen) setFullscreen(false);
      return;
    }
    markFullscreen(element, isFullscreen);
  }, [isFullscreen, setFullscreen, stageRef]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, setFullscreen]);
}
