"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { toastManager } from "@workspace/ui";
import { formatPreviewSelectionForAI, type SelectionInfo } from "@/shared/lib/format-selection-for-ai";
import type { PreviewHelperPayload } from "../lib/preview-helper/types";
import type { PreviewBridgeController, PreviewTransportMode } from "../lib/preview-bridge/types";

interface UsePreviewSelectionParams {
  desktopViewportRef: MutableRefObject<HTMLDivElement | null>;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  isElementPickerEnabledRef: MutableRefObject<boolean>;
  transportControllerRef: MutableRefObject<PreviewBridgeController | null>;
}

export function usePreviewSelection({
  desktopViewportRef,
  iframeRef,
  isElementPickerEnabledRef,
  transportControllerRef,
}: UsePreviewSelectionParams) {
  const [selectionPopoverVisible, setSelectionPopoverVisible] = useState(false);
  const [selectionPopoverExpanded, setSelectionPopoverExpanded] = useState(false);
  const [selectionPopoverPosition, setSelectionPopoverPosition] = useState({ x: 0, y: 0 });
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);
  const selectionInfoRef = useRef<SelectionInfo | null>(null);

  useEffect(() => {
    selectionInfoRef.current = selectionInfo;
  }, [selectionInfo]);

  const dismissSelectionPopover = useCallback((resetPreviewSelection: boolean = true) => {
    setSelectionPopoverVisible(false);
    setSelectionPopoverExpanded(false);
    setSelectionInfo(null);
    if (resetPreviewSelection) {
      void Promise.resolve(transportControllerRef.current?.clearSelection(false));
      if (isElementPickerEnabledRef.current) {
        void Promise.resolve(transportControllerRef.current?.enterPickMode());
      }
    }
  }, [isElementPickerEnabledRef, transportControllerRef]);

  const getPopoverPositionFromRect = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    const targetBounds =
      transportControllerRef.current?.mode === 'desktop-native'
        ? desktopViewportRef.current?.getBoundingClientRect()
        : iframeRef.current?.getBoundingClientRect();

    if (!targetBounds) {
      return { x: rect.x, y: rect.y + rect.height + 8 };
    }

    const estimatedPopoverWidth = 112;
    const estimatedPopoverHeight = 36;
    const rawX = targetBounds.left + rect.x + Math.min(rect.width, 220) / 2 - estimatedPopoverWidth / 2;
    const belowY = targetBounds.top + rect.y + rect.height + 12;
    const aboveY = targetBounds.top + rect.y - estimatedPopoverHeight - 12;
    const rawY =
      belowY + estimatedPopoverHeight <= window.innerHeight - 8
        ? belowY
        : Math.max(8, aboveY);

    return {
      x: Math.max(8, Math.min(rawX, Math.max(8, window.innerWidth - estimatedPopoverWidth - 8))),
      y: Math.max(8, rawY),
    };
  }, [desktopViewportRef, iframeRef, transportControllerRef]);

  const handleSelectedPayload = useCallback((mode: PreviewTransportMode, payload: PreviewHelperPayload) => {
    const nextSelectionInfo: SelectionInfo = {
      filePath: payload.pageUrl,
      startLine: 0,
      endLine: 0,
      selectedText: payload.elementContext.selectedText,
      language: "html",
      sourceType: "element",
      pageUrl: payload.pageUrl,
      selector: payload.elementContext.selector,
      tagName: payload.elementContext.tagName,
      attributesSummary: payload.elementContext.attributesSummary,
      textPreview: payload.elementContext.textPreview,
      htmlPreview: payload.elementContext.htmlPreview,
      framework: payload.sourceLocation?.framework,
      componentName: payload.sourceLocation?.componentName,
      componentFilePath: payload.sourceLocation?.filePath,
      componentLine: payload.sourceLocation?.line,
      componentColumn: payload.sourceLocation?.column,
      componentChain: payload.sourceLocation?.componentChain,
      sourceConfidence: payload.sourceLocation?.confidence,
      sourceDebugSignals: payload.sourceLocation?.debug,
      transportMode: mode,
    };

    setSelectionInfo(nextSelectionInfo);
    if (mode === 'desktop-native') {
      setSelectionPopoverVisible(false);
    } else {
      setSelectionPopoverPosition(getPopoverPositionFromRect(payload.rect));
      setSelectionPopoverVisible(true);
    }
    setSelectionPopoverExpanded(false);
  }, [getPopoverPositionFromRect]);

  const handleDesktopToolbarCopy = useCallback(async (userNote?: string) => {
    const info = selectionInfoRef.current;
    if (!info || info.transportMode !== 'desktop-native') return;

    try {
      await navigator.clipboard.writeText(formatPreviewSelectionForAI(info, userNote));
      toastManager.add({
        title: 'Copied',
        description: 'Selection copied for AI',
        type: 'success',
      });
      dismissSelectionPopover();
    } catch {
      toastManager.add({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        type: 'error',
      });
    }
  }, [dismissSelectionPopover]);

  return {
    dismissSelectionPopover,
    handleDesktopToolbarCopy,
    handleSelectedPayload,
    selectionInfo,
    selectionPopoverExpanded,
    selectionPopoverPosition,
    selectionPopoverRef,
    selectionPopoverVisible,
    setSelectionPopoverExpanded,
  };
}
