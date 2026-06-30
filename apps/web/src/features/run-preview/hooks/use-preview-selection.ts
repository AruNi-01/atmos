"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslations } from "next-intl";
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

export interface PreviewSelectionAnnotation {
  id: string;
  info: SelectionInfo;
  note?: string;
}

function createPreviewAnnotationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSelectionInfo(info: SelectionInfo): SelectionInfo {
  return {
    ...info,
    componentChain: info.componentChain ? [...info.componentChain] : undefined,
    sourceDebugSignals: info.sourceDebugSignals ? [...info.sourceDebugSignals] : undefined,
    previewRect: info.previewRect ? { ...info.previewRect } : undefined,
  };
}

type PreviewSelectionTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function formatPreviewAnnotationsForAI(
  annotations: PreviewSelectionAnnotation[],
  t: PreviewSelectionTranslator,
): string {
  if (annotations.length === 1) {
    return formatPreviewSelectionForAI(annotations[0].info, annotations[0].note);
  }

  const sections = annotations.map((annotation, index) => {
    const formatted = formatPreviewSelectionForAI(annotation.info, annotation.note)
      .replace(/^## /m, "### ");
    return `## ${t("aiContext.annotationTitle", { index: index + 1 })}\n\n${formatted}`;
  });

  return [
    `# ${t("aiContext.title")}`,
    "",
    t("aiContext.description", { count: annotations.length }),
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
  const t = useTranslations("preview.selection");
  const [selectionPopoverVisible, setSelectionPopoverVisible] = useState(false);
  const [selectionPopoverExpanded, setSelectionPopoverExpanded] = useState(false);
  const [selectionPopoverPosition, setSelectionPopoverPosition] = useState({ x: 0, y: 0 });
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [selectionAnnotations, setSelectionAnnotations] = useState<PreviewSelectionAnnotation[]>([]);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null);
  const selectionInfoRef = useRef<SelectionInfo | null>(null);
  const selectionAnnotationsRef = useRef<PreviewSelectionAnnotation[]>([]);
  const editingAnnotationIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectionInfoRef.current = selectionInfo;
  }, [selectionInfo]);

  useEffect(() => {
    selectionAnnotationsRef.current = selectionAnnotations;
  }, [selectionAnnotations]);

  useEffect(() => {
    editingAnnotationIdRef.current = editingAnnotationId;
  }, [editingAnnotationId]);

  const dismissSelectionPopover = useCallback((resetPreviewSelection: boolean = true) => {
    setSelectionPopoverVisible(false);
    setSelectionPopoverExpanded(false);
    setSelectionInfo(null);
    setEditingAnnotationId(null);
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
      previewRect: { ...payload.rect },
    };

    setEditingAnnotationId(null);
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
        title: t("toast.copiedTitle"),
        description: t("toast.selectionCopiedDescription"),
        type: 'success',
      });
      dismissSelectionPopover();
    } catch {
      toastManager.add({
        title: t("toast.copyFailedTitle"),
        description: t("toast.selectionCopyFailedDescription"),
        type: 'error',
      });
    }
  }, [dismissSelectionPopover, t]);

  const handleAddSelectionAnnotation = useCallback((userNote?: string, explicitInfo?: SelectionInfo, annotationId?: string) => {
    const info = explicitInfo ?? selectionInfoRef.current;
    if (!info) return;

    let nextCount = selectionAnnotationsRef.current.length + 1;
    const note = userNote?.trim() || undefined;
    setSelectionAnnotations((previous) => {
      const nextAnnotations = [
        ...previous,
        {
          id: annotationId || createPreviewAnnotationId(),
          info: cloneSelectionInfo(info),
          note,
        },
      ];
      nextCount = nextAnnotations.length;
      return nextAnnotations;
    });

    toastManager.add({
      title: t("toast.annotationAddedTitle"),
      description: t("toast.annotationReadyDescription", { count: nextCount }),
      type: 'success',
    });
    dismissSelectionPopover();
  }, [dismissSelectionPopover, t]);

  const handleUpdateSelectionAnnotation = useCallback((annotationId?: string, userNote?: string) => {
    if (!annotationId) return;
    const note = userNote?.trim() || undefined;
    setSelectionAnnotations((previous) =>
      previous.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              note,
            }
          : annotation,
      ),
    );
    toastManager.add({
      title: t("toast.annotationUpdatedTitle"),
      description: t("toast.annotationUpdatedDescription"),
      type: 'success',
    });
    setSelectionPopoverVisible(false);
    setSelectionPopoverExpanded(false);
    setSelectionInfo(null);
    setEditingAnnotationId(null);
  }, [t]);

  const handleDeleteSelectionAnnotation = useCallback((annotationId?: string) => {
    if (!annotationId) return;
    setSelectionAnnotations((previous) => previous.filter((annotation) => annotation.id !== annotationId));
    if (editingAnnotationIdRef.current === annotationId) {
      setSelectionPopoverVisible(false);
      setSelectionPopoverExpanded(false);
      setSelectionInfo(null);
      setEditingAnnotationId(null);
    }
    toastManager.add({
      title: t("toast.annotationDeletedTitle"),
      description: t("toast.annotationDeletedDescription"),
      type: 'success',
    });
  }, [t]);

  const handleEditSelectionAnnotation = useCallback((annotation: PreviewSelectionAnnotation) => {
    const rect = annotation.info.previewRect ?? { x: 0, y: 0, width: 0, height: 0 };
    setEditingAnnotationId(annotation.id);
    setSelectionInfo(annotation.info);
    setSelectionPopoverPosition(getPopoverPositionFromRect(rect));
    setSelectionPopoverVisible(true);
    setSelectionPopoverExpanded(false);
  }, [getPopoverPositionFromRect]);

  const handleCopySelectionAnnotations = useCallback(async () => {
    const annotations = selectionAnnotationsRef.current;
    if (annotations.length === 0) return;

    try {
      await navigator.clipboard.writeText(formatPreviewAnnotationsForAI(annotations, t));
      await Promise.resolve(transportControllerRef.current?.clearAnnotations?.());
      setSelectionAnnotations([]);
      toastManager.add({
        title: t("toast.copiedTitle"),
        description: t("toast.annotationsCopiedDescription", {
          count: annotations.length,
        }),
        type: 'success',
      });
      dismissSelectionPopover();
    } catch {
      toastManager.add({
        title: t("toast.copyFailedTitle"),
        description: t("toast.annotationsCopyFailedDescription"),
        type: 'error',
      });
    }
  }, [dismissSelectionPopover, t, transportControllerRef]);

  return {
    dismissSelectionPopover,
    editingAnnotationId,
    handleAddSelectionAnnotation,
    handleDeleteSelectionAnnotation,
    handleCopySelectionAnnotations,
    handleDesktopToolbarCopy,
    handleEditSelectionAnnotation,
    handleSelectedPayload,
    handleUpdateSelectionAnnotation,
    selectionAnnotations,
    selectionAnnotationCount: selectionAnnotations.length,
    selectionInfo,
    selectionPopoverExpanded,
    selectionPopoverPosition,
    selectionPopoverRef,
    selectionPopoverVisible,
    setSelectionPopoverExpanded,
  };
}
