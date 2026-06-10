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

interface PreviewSelectionAnnotation {
  info: SelectionInfo;
  note?: string;
}

function cloneSelectionInfo(info: SelectionInfo): SelectionInfo {
  return {
    ...info,
    componentChain: info.componentChain ? [...info.componentChain] : undefined,
    sourceDebugSignals: info.sourceDebugSignals ? [...info.sourceDebugSignals] : undefined,
  };
}

function formatPreviewAnnotationsForAI(annotations: PreviewSelectionAnnotation[]): string {
  if (annotations.length === 1) {
    return formatPreviewSelectionForAI(annotations[0].info, annotations[0].note);
  }

  const sections = annotations.map((annotation, index) => {
    const formatted = formatPreviewSelectionForAI(annotation.info, annotation.note)
      .replace(/^## Preview Element/m, "### Preview Element");
    return `## Annotation ${index + 1}\n\n${formatted}`;
  });

  return [
    "# Preview Element Annotations",
    "",
    `Use these ${annotations.length} selected preview elements as context.`,
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n").trimEnd();
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
  const [selectionAnnotations, setSelectionAnnotations] = useState<PreviewSelectionAnnotation[]>([]);
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);
  const selectionInfoRef = useRef<SelectionInfo | null>(null);
  const selectionAnnotationsRef = useRef<PreviewSelectionAnnotation[]>([]);

  useEffect(() => {
    selectionInfoRef.current = selectionInfo;
  }, [selectionInfo]);

  useEffect(() => {
    selectionAnnotationsRef.current = selectionAnnotations;
  }, [selectionAnnotations]);

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

    const estimatedPopoverWidth = 320;
    const estimatedPopoverHeight = 180;
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

  const handleAddSelectionAnnotation = useCallback((userNote?: string, explicitInfo?: SelectionInfo) => {
    const info = explicitInfo ?? selectionInfoRef.current;
    if (!info) return;

    let nextCount = selectionAnnotationsRef.current.length + 1;
    const note = userNote?.trim() || undefined;
    setSelectionAnnotations((previous) => {
      const nextAnnotations = [
        ...previous,
        {
          info: cloneSelectionInfo(info),
          note,
        },
      ];
      nextCount = nextAnnotations.length;
      return nextAnnotations;
    });

    toastManager.add({
      title: 'Annotation added',
      description: `${nextCount} annotation${nextCount === 1 ? '' : 's'} ready to copy`,
      type: 'success',
    });
    dismissSelectionPopover();
  }, [dismissSelectionPopover]);

  const handleCopySelectionAnnotations = useCallback(async () => {
    const annotations = selectionAnnotationsRef.current;
    if (annotations.length === 0) return;

    try {
      await navigator.clipboard.writeText(formatPreviewAnnotationsForAI(annotations));
      setSelectionAnnotations([]);
      toastManager.add({
        title: 'Copied',
        description: `${annotations.length} annotation${annotations.length === 1 ? '' : 's'} copied for AI`,
        type: 'success',
      });
      dismissSelectionPopover();
    } catch {
      toastManager.add({
        title: 'Failed to copy',
        description: 'Could not copy annotations to clipboard',
        type: 'error',
      });
    }
  }, [dismissSelectionPopover]);

  return {
    dismissSelectionPopover,
    handleAddSelectionAnnotation,
    handleCopySelectionAnnotations,
    handleDesktopToolbarCopy,
    handleSelectedPayload,
    selectionAnnotationCount: selectionAnnotations.length,
    selectionInfo,
    selectionPopoverExpanded,
    selectionPopoverPosition,
    selectionPopoverRef,
    selectionPopoverVisible,
    setSelectionPopoverExpanded,
  };
}
