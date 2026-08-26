"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { create } from "zustand";

import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import {
  CENTER_STAGE_FULLSCREEN_ATTR,
} from "@/app-shell/center-stage-fullscreen";

type CenterStageFullscreenState = {
  isFullscreen: boolean;
  paneId: string | null;
  contextId: string | null;
  /** Restore from the mosaic persisted for `contextId`. Does not write layout. */
  syncFromLayout: (contextId: string, fullscreenPaneId: string | null) => void;
  setFullscreen: (next: boolean, paneId?: string | null) => void;
  toggleFullscreen: (paneId?: string | null) => void;
};

function persistFullscreenPane(contextId: string | null, paneId: string | null): void {
  if (!contextId) return;
  useCenterPaneLayoutStore.getState().setFullscreenPane(contextId, paneId);
}

export const useCenterStageFullscreenStore = create<CenterStageFullscreenState>((set, get) => ({
  isFullscreen: false,
  paneId: null,
  contextId: null,
  syncFromLayout: (contextId, fullscreenPaneId) =>
    set((state) => {
      const paneId = fullscreenPaneId ?? null;
      const isFullscreen = Boolean(paneId);
      if (
        state.contextId === contextId &&
        state.paneId === paneId &&
        state.isFullscreen === isFullscreen
      ) {
        return state;
      }
      return { ...state, contextId, paneId, isFullscreen };
    }),
  setFullscreen: (next, paneId) => {
    set((state) =>
      next
        ? { ...state, isFullscreen: true, paneId: paneId ?? null }
        : { ...state, isFullscreen: false, paneId: null },
    );
    const state = get();
    persistFullscreenPane(state.contextId, state.isFullscreen ? state.paneId : null);
  },
  toggleFullscreen: (paneId) => {
    set((state) =>
      state.isFullscreen
        ? { ...state, isFullscreen: false, paneId: null }
        : { ...state, isFullscreen: true, paneId: paneId ?? state.paneId },
    );
    const state = get();
    persistFullscreenPane(state.contextId, state.isFullscreen ? state.paneId : null);
  },
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
    if (!element) return;
    markFullscreen(element, isFullscreen);
    return () => {
      markFullscreen(element, false);
    };
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
