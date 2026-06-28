"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

const HISTORY_SIDEBAR_DEFAULT_WIDTH = 320;
const HISTORY_SIDEBAR_MIN_WIDTH = 248;
const HISTORY_SIDEBAR_MAX_WIDTH = 440;
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
    const panelBoundedMax = panelWidth > 0
      ? Math.max(HISTORY_SIDEBAR_MIN_WIDTH, Math.min(HISTORY_SIDEBAR_MAX_WIDTH, panelWidth - 520))
      : HISTORY_SIDEBAR_MAX_WIDTH;
    return Math.round(Math.min(panelBoundedMax, Math.max(HISTORY_SIDEBAR_MIN_WIDTH, width)));
  }, [panelWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HISTORY_SIDEBAR_WIDTH_STORAGE_KEY, String(historySidebarWidth));
  }, [historySidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY,
      historySidebarCollapsed ? "true" : "false",
    );
  }, [historySidebarCollapsed]);

  const handleHistorySidebarResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const frame = historySidebarFrameRef.current;
    const startWidth = clampHistorySidebarWidth(
      frame?.getBoundingClientRect().width ?? historySidebarWidth,
    );
    historyResizeState.current = {
      startX: e.clientX,
      startWidth,
      currentWidth: startWidth,
      frame,
    };
    setIsHistorySidebarResizing(true);
    setHistorySidebarPreviewWidth(startWidth);
    if (frame) {
      frame.style.width = `${startWidth}px`;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let restoredDocumentInteraction = false;
    const restoreDocumentInteraction = () => {
      if (restoredDocumentInteraction) return;
      restoredDocumentInteraction = true;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const handleMove = (ev: MouseEvent) => {
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

    const handleUp = () => {
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
  const storedValue = window.localStorage.getItem(HISTORY_SIDEBAR_WIDTH_STORAGE_KEY);
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
  return window.localStorage.getItem(HISTORY_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}
