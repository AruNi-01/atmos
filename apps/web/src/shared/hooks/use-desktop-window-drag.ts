"use client";

import { useCallback, useEffect, useState } from "react";

import { isDesktopRuntime, isTauriRuntime } from "@/shared/lib/desktop-runtime";

const DESKTOP_WINDOW_DRAG_INTERACTIVE_SELECTOR =
  '.desktop-no-drag, button, a, input, textarea, select, summary, [role="button"], [contenteditable], [contenteditable="true"]';

/**
 * Enables header drag + traffic-light left inset on any desktop shell.
 * Tauri: CSS drag-region + startDragging fallback.
 * Electron: CSS `-webkit-app-region: drag` is sufficient.
 */
export function useDesktopWindowDrag() {
  const [isDesktopDragEnabled, setIsDesktopDragEnabled] = useState(false);

  useEffect(() => {
    const refresh = () => setIsDesktopDragEnabled(isDesktopRuntime());
    refresh();
    const t = window.setTimeout(refresh, 100);
    return () => window.clearTimeout(t);
  }, []);

  const handleDesktopWindowMouseDown = useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      if (!isDesktopDragEnabled) return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(DESKTOP_WINDOW_DRAG_INTERACTIVE_SELECTOR)) return;

      // Electron: app-region: drag handles it — no JS needed.
      // Tauri: start native drag when available.
      if (!isTauriRuntime()) return;

      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
      } catch {
        // Ignore drag failures; native drag-region remains as fallback.
      }
    },
    [isDesktopDragEnabled],
  );

  return {
    handleDesktopWindowMouseDown,
    isDesktopDragEnabled,
  };
}
