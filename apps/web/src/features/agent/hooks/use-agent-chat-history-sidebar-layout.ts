"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { isResizeClickGesture } from "@/app-shell/resize-click-fold";

const HISTORY_SIDEBAR_DEFAULT_WIDTH = 320;
const HISTORY_SIDEBAR_MIN_WIDTH = 248;
const HISTORY_SIDEBAR_MAX_WIDTH = 440;
/** Matches the chat column `max-w-3xl` so the directory stays in the side margin. */
const CHAT_COLUMN_REM = 48;
/** Message rail width (`w-8`). It stays in the left margin, beside the directory. */
const TIMELINE_RAIL_PX = 32;

function chatSideRoomPx(panelWidth: number, rem: number): number {
  if (panelWidth <= 0) return 0;
  const column = Math.min(panelWidth, CHAT_COLUMN_REM * rem);
  return Math.max(0, (panelWidth - column) / 2);
}

/** Float the rail only when the side margin can hold it without covering messages. */
export function chatTimelineFloats(panelWidth: number, rem = 16): boolean {
  // Unknown width (first paint) keeps the wide layout so a measured wide pane does not jump.
  if (panelWidth <= 0) return true;
  return chatSideRoomPx(panelWidth, rem) >= TIMELINE_RAIL_PX;
}

/**
 * Left edge of the message rail. Closed directory: the panel's left edge.
 * Open directory: just to its right, still outside the centered column.
 */
export function chatRailLeftPx(
  panelWidth: number,
  sidebarWidth: number,
  sidebarOpen: boolean,
  rem = 16,
): number {
  if (!sidebarOpen || panelWidth <= 0) return 0;
  const sideRoom = chatSideRoomPx(panelWidth, rem);
  if (sidebarWidth + TIMELINE_RAIL_PX <= sideRoom) return sidebarWidth;
  return Math.max(0, sideRoom - TIMELINE_RAIL_PX);
}

const HISTORY_SIDEBAR_WIDTH_STORAGE_KEY = "atmos:agent-chat-history-sidebar-width";
const HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY = "atmos:agent-chat-history-sidebar-collapsed";

export function useAgentChatHistorySidebarLayout({
  panelWidth,
}: {
  panelWidth: number;
}) {
  const [historySidebarWidth, setHistorySidebarWidth] = useState(readStoredHistorySidebarWidth);
  const [historySidebarCollapsed, setHistorySidebarCollapsed] = useState(readStoredHistorySidebarCollapsed);
  const historySidebarFrameRef = useRef<HTMLDivElement>(null);
  const historyResizeState = useRef<{
    startX: number;
    startWidth: number;
    currentWidth: number;
    frame: HTMLDivElement | null;
  } | null>(null);
  const historyResizeAbortController = useRef<AbortController | null>(null);
  const historyResizeAnimationFrame = useRef<number | null>(null);
  const [isHistorySidebarResizing, setIsHistorySidebarResizing] = useState(false);
  const [historySidebarPreviewWidth, setHistorySidebarPreviewWidth] = useState<number | null>(null);

  const clampHistorySidebarWidth = useCallback((width: number) => {
    // Side margin beside a centered 48rem column. The directory must not
    // consume that column, so it cannot grow past the margin.
    const rem = typeof window === "undefined"
      ? 16
      : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const contentCap = CHAT_COLUMN_REM * rem;
    const sideRoom = panelWidth > 0
      ? Math.max(0, (panelWidth - Math.min(contentCap, panelWidth)) / 2)
      : HISTORY_SIDEBAR_MAX_WIDTH;
    const panelBoundedMax = Math.min(HISTORY_SIDEBAR_MAX_WIDTH, sideRoom);
    const floor = Math.min(HISTORY_SIDEBAR_MIN_WIDTH, panelBoundedMax);
    return Math.round(Math.min(panelBoundedMax, Math.max(floor, width)));
  }, [panelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStoredHistorySidebarValue(
      HISTORY_SIDEBAR_WIDTH_STORAGE_KEY,
      String(historySidebarWidth),
    );
  }, [historySidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStoredHistorySidebarValue(
      HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY,
      historySidebarCollapsed ? "true" : "false",
    );
  }, [historySidebarCollapsed]);

  const handleHistorySidebarResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const frame = historySidebarFrameRef.current;
    const startWidth = clampHistorySidebarWidth(
      frame?.getBoundingClientRect().width ?? historySidebarWidth,
    );
    let dragStarted = false;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let restoredDocumentInteraction = false;
    const restoreDocumentInteraction = () => {
      if (restoredDocumentInteraction) return;
      restoredDocumentInteraction = true;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const beginDrag = () => {
      if (dragStarted) return;
      dragStarted = true;
      historyResizeState.current = {
        startX: start.x,
        startWidth,
        currentWidth: startWidth,
        frame,
      };
      setIsHistorySidebarResizing(true);
      setHistorySidebarPreviewWidth(startWidth);
      if (frame) {
        frame.style.width = `${startWidth}px`;
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const handleMove = (ev: MouseEvent) => {
      if (
        !dragStarted &&
        isResizeClickGesture(start, { x: ev.clientX, y: ev.clientY })
      ) {
        return;
      }
      beginDrag();
      const state = historyResizeState.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      state.currentWidth = clampHistorySidebarWidth(state.startWidth + dx);
      if (historyResizeAnimationFrame.current !== null) return;

      historyResizeAnimationFrame.current = window.requestAnimationFrame(() => {
        historyResizeAnimationFrame.current = null;
        const latestState = historyResizeState.current;
        if (!latestState?.frame) return;
        latestState.frame.style.width = `${latestState.currentWidth}px`;
      });
    };

    const handleUp = (ev: MouseEvent) => {
      if (
        !dragStarted &&
        isResizeClickGesture(start, { x: ev.clientX, y: ev.clientY })
      ) {
        setHistorySidebarCollapsed(true);
        restoreDocumentInteraction();
        historyResizeAbortController.current?.abort();
        historyResizeAbortController.current = null;
        return;
      }
      const finalWidth = historyResizeState.current?.currentWidth ?? historySidebarWidth;
      if (historyResizeAnimationFrame.current !== null) {
        window.cancelAnimationFrame(historyResizeAnimationFrame.current);
        historyResizeAnimationFrame.current = null;
      }
      if (historyResizeState.current?.frame) {
        historyResizeState.current.frame.style.width = `${finalWidth}px`;
      }
      historyResizeState.current = null;
      setHistorySidebarWidth(finalWidth);
      setHistorySidebarPreviewWidth(null);
      setIsHistorySidebarResizing(false);
      restoreDocumentInteraction();
      historyResizeAbortController.current?.abort();
      historyResizeAbortController.current = null;
    };

    historyResizeAbortController.current = new AbortController();
    const { signal } = historyResizeAbortController.current;
    signal.addEventListener("abort", restoreDocumentInteraction, { once: true });
    document.addEventListener("mousemove", handleMove, { signal });
    document.addEventListener("mouseup", handleUp, { signal });
  }, [clampHistorySidebarWidth, historySidebarWidth]);

  useEffect(() => {
    return () => {
      if (historyResizeAnimationFrame.current !== null) {
        window.cancelAnimationFrame(historyResizeAnimationFrame.current);
        historyResizeAnimationFrame.current = null;
      }
      historyResizeAbortController.current?.abort();
      historyResizeAbortController.current = null;
    };
  }, []);

  const renderedHistorySidebarWidth =
    historySidebarPreviewWidth ?? clampHistorySidebarWidth(historySidebarWidth);

  return {
    historySidebarFrameRef,
    historySidebarWidth: renderedHistorySidebarWidth,
    historySidebarCollapsed,
    setHistorySidebarCollapsed,
    isHistorySidebarResizing,
    handleHistorySidebarResizeStart,
  };
}

function readStoredHistorySidebarWidth() {
  if (typeof window === "undefined") return HISTORY_SIDEBAR_DEFAULT_WIDTH;
  const storedValue = readStoredHistorySidebarValue(HISTORY_SIDEBAR_WIDTH_STORAGE_KEY);
  if (storedValue === null) return HISTORY_SIDEBAR_DEFAULT_WIDTH;
  const stored = Number(storedValue);
  if (!Number.isFinite(stored)) return HISTORY_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(
    HISTORY_SIDEBAR_MAX_WIDTH,
    Math.max(HISTORY_SIDEBAR_MIN_WIDTH, stored),
  );
}

function readStoredHistorySidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return readStoredHistorySidebarValue(HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

function readStoredHistorySidebarValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredHistorySidebarValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Layout persistence is best-effort.
  }
}
