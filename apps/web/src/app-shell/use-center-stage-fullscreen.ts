"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { create } from "zustand";

import { APP_SHELL_PANEL_LAYOUT_ATTR } from "@/app-shell/sidebar-layout-constants";
import {
  CENTER_STAGE_FULLSCREEN_ATTR,
  CENTER_STAGE_FULLSCREEN_MOTION_MS,
  applyCenterStageFullscreenPin,
  clearCenterStageFullscreenPin,
  measureExpandedCenterStageRect,
  readViewportRect,
} from "@/app-shell/center-stage-fullscreen";

type CenterStageFullscreenState = {
  isFullscreen: boolean;
  setFullscreen: (next: boolean) => void;
  toggleFullscreen: () => void;
};

export const useCenterStageFullscreenStore = create<CenterStageFullscreenState>((set) => ({
  isFullscreen: false,
  setFullscreen: (next) => set({ isFullscreen: next }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
}));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function readExpandedRect(): ReturnType<typeof measureExpandedCenterStageRect> {
  const panel = document.querySelector(`[${APP_SHELL_PANEL_LAYOUT_ATTR}]`);
  const header = document.querySelector("[data-app-shell-header]");
  return measureExpandedCenterStageRect({
    panel: panel ? readViewportRect(panel) : null,
    headerBottom: header?.getBoundingClientRect().bottom,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

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
  const pinnedRef = useRef(false);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) {
      if (isFullscreen) setFullscreen(false);
      return;
    }

    const reduced = prefersReducedMotion();
    let cancelled = false;
    let frameA = 0;
    let frameB = 0;
    let settleTimer = 0;

    const cancelFrames = () => {
      cancelled = true;
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
      window.clearTimeout(settleTimer);
    };

    const runAfterPaint = (next: () => void) => {
      frameA = window.requestAnimationFrame(() => {
        frameB = window.requestAnimationFrame(() => {
          if (!cancelled) next();
        });
      });
    };

    if (isFullscreen && !pinnedRef.current) {
      pinnedRef.current = true;
      const from = readViewportRect(element);
      applyCenterStageFullscreenPin(element, from, false);
      markFullscreen(element, true);
      void element.offsetWidth;
      if (reduced) {
        applyCenterStageFullscreenPin(element, readExpandedRect(), false);
        return cancelFrames;
      }
      runAfterPaint(() => {
        applyCenterStageFullscreenPin(element, readExpandedRect(), true);
      });
      return cancelFrames;
    }

    if (!isFullscreen && pinnedRef.current) {
      pinnedRef.current = false;
      const slot = element.parentElement;
      const to = slot ? readViewportRect(slot) : readViewportRect(element);
      if (reduced) {
        clearCenterStageFullscreenPin(element);
        markFullscreen(element, false);
        return cancelFrames;
      }
      applyCenterStageFullscreenPin(element, readViewportRect(element), false);
      void element.offsetWidth;
      runAfterPaint(() => {
        applyCenterStageFullscreenPin(element, to, true);
      });
      const settle = () => {
        if (cancelled || useCenterStageFullscreenStore.getState().isFullscreen) return;
        clearCenterStageFullscreenPin(element);
        markFullscreen(element, false);
      };
      const onEnd = (event: TransitionEvent) => {
        if (event.target !== element) return;
        if (event.propertyName !== "width" && event.propertyName !== "height") return;
        element.removeEventListener("transitionend", onEnd);
        settle();
      };
      element.addEventListener("transitionend", onEnd);
      settleTimer = window.setTimeout(settle, CENTER_STAGE_FULLSCREEN_MOTION_MS + 80);
      return () => {
        cancelFrames();
        element.removeEventListener("transitionend", onEnd);
      };
    }

    if (isFullscreen && pinnedRef.current) {
      applyCenterStageFullscreenPin(element, readExpandedRect(), false);
    }

    return cancelFrames;
  }, [isFullscreen, setFullscreen, stageRef]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onResize = () => {
      const element = stageRef.current;
      if (!element) return;
      applyCenterStageFullscreenPin(element, readExpandedRect(), false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isFullscreen, stageRef]);

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
