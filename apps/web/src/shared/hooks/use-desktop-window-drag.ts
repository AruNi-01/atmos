"use client";

import { useCallback, useMemo } from "react";

import { isTauriRuntime } from "@/shared/lib/desktop-runtime";

const DESKTOP_WINDOW_DRAG_INTERACTIVE_SELECTOR =
  '.desktop-no-drag, button, a, input, textarea, select, summary, [role="button"], [contenteditable="true"]';

export function useDesktopWindowDrag() {
  const isDesktopDragEnabled = useMemo(() => isTauriRuntime(), []);

  const handleDesktopWindowMouseDown = useCallback(async (event: React.MouseEvent<HTMLElement>) => {
    if (!isDesktopDragEnabled) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(DESKTOP_WINDOW_DRAG_INTERACTIVE_SELECTOR)) return;

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // Ignore drag failures; native drag-region remains as fallback.
    }
  }, [isDesktopDragEnabled]);

  return {
    handleDesktopWindowMouseDown,
    isDesktopDragEnabled,
  };
}
