"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PreviewTransportMode } from "../lib/preview-bridge/types";

type ResolvedTransportMode = PreviewTransportMode | "unavailable";

interface UsePreviewToolbarLayoutArgs {
  isMaximized: boolean;
  isToolbarHidden: boolean;
  resolvedTransportMode: ResolvedTransportMode;
  setToolbarHiddenParam: (nextIsToolbarHidden: boolean) => void;
}

export function usePreviewToolbarLayout({
  isMaximized,
  isToolbarHidden,
  resolvedTransportMode,
  setToolbarHiddenParam,
}: UsePreviewToolbarLayoutArgs) {
  const toolbarRowRef = useRef<HTMLDivElement | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const [toolbarHoverSuppressed, setToolbarHoverSuppressed] = useState(false);
  const [desktopToolbarHovered, setDesktopToolbarHovered] = useState(false);
  const toolbarSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setIsToolbarHidden = useCallback(
    (nextIsToolbarHidden: boolean) => {
      if (nextIsToolbarHidden) {
        setDesktopToolbarHovered(false);
        setToolbarHoverSuppressed(true);
        if (toolbarSuppressTimerRef.current) clearTimeout(toolbarSuppressTimerRef.current);
        toolbarSuppressTimerRef.current = setTimeout(() => setToolbarHoverSuppressed(false), 400);
      }
      setToolbarHiddenParam(nextIsToolbarHidden);
    },
    [setToolbarHiddenParam],
  );

  useEffect(
    () => () => {
      if (toolbarSuppressTimerRef.current) {
        clearTimeout(toolbarSuppressTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const toolbarRow = toolbarRowRef.current;
    if (!toolbarRow) return;

    const syncToolbarWidth = () => {
      setToolbarWidth(toolbarRow.getBoundingClientRect().width);
    };

    syncToolbarWidth();

    const observer = new ResizeObserver(() => {
      syncToolbarWidth();
    });
    observer.observe(toolbarRow);
    window.addEventListener("resize", syncToolbarWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncToolbarWidth);
    };
  }, []);

  useLayoutEffect(() => {
    const toolbarRow = toolbarRowRef.current;
    if (!toolbarRow) return;

    setToolbarWidth(toolbarRow.getBoundingClientRect().width);
  }, [isMaximized]);

  const effectiveIsToolbarHidden = isToolbarHidden;
  const usesToolbarHoverOverlay =
    effectiveIsToolbarHidden && resolvedTransportMode !== "desktop-native";
  const usesDesktopToolbarExpand =
    effectiveIsToolbarHidden && resolvedTransportMode === "desktop-native";
  const desktopToolbarExpanded =
    usesDesktopToolbarExpand && desktopToolbarHovered && !toolbarHoverSuppressed;
  const toolbarToggleTitle = effectiveIsToolbarHidden
    ? "Show Toolbar"
    : resolvedTransportMode === "desktop-native"
      ? "Hide Toolbar"
      : "Auto-hide Toolbar";
  const shouldHideToolbarStatus = toolbarWidth > 0 && toolbarWidth < 1024;
  const shouldHideToolbarViewControls = toolbarWidth > 0 && toolbarWidth < 900;
  const shouldHideToolbarNavigation = toolbarWidth > 0 && toolbarWidth < 700;
  const shouldHideToolbarExternalActions = toolbarWidth > 0 && toolbarWidth < 620;
  const shouldHideToolbarUtilityActions =
    resolvedTransportMode === "desktop-native" ? false : toolbarWidth > 0 && toolbarWidth < 540;
  const shouldUseCompactToolbar = toolbarWidth > 0 && toolbarWidth < 760;
  const shouldShowToolbarToggle =
    resolvedTransportMode === "desktop-native" ||
    (!shouldHideToolbarUtilityActions && !shouldUseCompactToolbar);
  const shouldStackPreviewHomeCards = toolbarWidth > 0 && toolbarWidth < 900;
  const shouldStackPreviewHomeNotes = toolbarWidth > 0 && toolbarWidth < 760;

  return {
    desktopToolbarExpanded,
    effectiveIsToolbarHidden,
    setDesktopToolbarHovered,
    setIsToolbarHidden,
    shouldHideToolbarExternalActions,
    shouldHideToolbarNavigation,
    shouldHideToolbarStatus,
    shouldHideToolbarViewControls,
    shouldShowToolbarToggle,
    shouldStackPreviewHomeCards,
    shouldStackPreviewHomeNotes,
    shouldUseCompactToolbar,
    toolbarHoverSuppressed,
    toolbarRowRef,
    toolbarToggleTitle,
    usesDesktopToolbarExpand,
    usesToolbarHoverOverlay,
  };
}
