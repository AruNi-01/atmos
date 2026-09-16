"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Copy, Download, PencilSparkles, Redo2, Save, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { toastManager } from "@workspace/ui";
import {
  ImageCopyContextMenu,
  useImageCopyMenu,
} from "@/shared/components/image-copy-context-menu";
import { copyImageSrcToClipboard, saveImageSrcToDisk } from "@/shared/utils/copy-image";

export const IMAGE_PREVIEW_ZOOM_MS = 320;
export const IMAGE_PREVIEW_STAGE_RATIO = 0.95;
export const IMAGE_PREVIEW_TOOLBAR_GAP_PX = 12;
export const IMAGE_PREVIEW_TOOLBAR_TOP_GAP_PX = 12;
export const IMAGE_PREVIEW_MIN_EDGE_GAP_PX = 1;
/** p-1 + size-8 + 1px border. Measured at runtime if the pill size changes. */
export const IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX = 42;
const USER_ZOOM_MIN = 0.5;
const USER_ZOOM_MAX = 3;
const USER_ZOOM_STEP = 0.25;
const STAGE_RADIUS_PX = 18;
const ZOOM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export type ImagePreviewOriginRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Visible corner radius of the thumbnail, in CSS pixels. */
  radius: number;
  naturalWidth?: number;
  naturalHeight?: number;
};

type ImagePreviewOverlayProps = {
  alt: string;
  src: string;
  originRect?: ImagePreviewOriginRect | null;
  durationMs?: number;
  onClose: () => void;
  /** When set, the overlay can annotate the image and save a new file back to the composer. */
  onSaveAnnotation?: (file: File) => void | Promise<void>;
  annotationFileName?: string;
};

type AnnotatePoint = { x: number; y: number };
type AnnotateStroke = { points: AnnotatePoint[] };

const ANNOTATE_COLOR = "#ef4444";
const ANNOTATE_WIDTH = 3.5;

function annotatedFileName(name?: string): string {
  const base = (name ?? "").trim() || "image";
  const stripped = base.replace(/\.[a-z0-9]+$/i, "");
  return `${stripped}-annotated.png`;
}

function pointerToCanvasPoint(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): AnnotatePoint {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || cssWidth;
  const height = rect.height || cssHeight;
  return {
    x: ((event.clientX - rect.left) / width) * cssWidth,
    y: ((event.clientY - rect.top) / height) * cssHeight,
  };
}

function paintAnnotateStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: AnnotateStroke[],
  scale: number,
): void {
  ctx.strokeStyle = ANNOTATE_COLOR;
  ctx.lineWidth = ANNOTATE_WIDTH * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const first = stroke.points[0]!;
    ctx.beginPath();
    ctx.moveTo(first.x * scale, first.y * scale);
    if (stroke.points.length === 1) {
      ctx.lineTo(first.x * scale + 0.01, first.y * scale);
    } else {
      for (let i = 1; i < stroke.points.length; i += 1) {
        const point = stroke.points[i]!;
        ctx.lineTo(point.x * scale, point.y * scale);
      }
    }
    ctx.stroke();
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = src;
  });
}

async function fileFromAnnotatedImage(opts: {
  src: string;
  img: HTMLImageElement | null;
  strokes: AnnotateStroke[];
  cssWidth: number;
  cssHeight: number;
  fileName: string;
}): Promise<File | null> {
  if (opts.strokes.length === 0 || opts.cssWidth < 1 || opts.cssHeight < 1) return null;
  let source = opts.img;
  if (!source || source.naturalWidth < 1 || source.naturalHeight < 1) {
    try {
      source = await loadImageElement(opts.src);
    } catch {
      return null;
    }
  }
  const width = source.naturalWidth || Math.round(opts.cssWidth);
  const height = source.naturalHeight || Math.round(opts.cssHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  paintAnnotateStrokes(ctx, opts.strokes, width / opts.cssWidth);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((next) => resolve(next), "image/png");
  });
  if (!blob) return null;
  return new File([blob], opts.fileName, { type: "image/png" });
}

const DEFAULT_THUMB_RADIUS_PX = 12;

function visibleBorderRadiusPx(node: Element): number {
  if (typeof getComputedStyle !== "function") return DEFAULT_THUMB_RADIUS_PX;
  let current: Element | null = node;
  for (let i = 0; i < 5 && current; i += 1) {
    const value = Number.parseFloat(getComputedStyle(current).borderTopLeftRadius);
    if (Number.isFinite(value) && value > 0) return value;
    current = current.parentElement;
  }
  return DEFAULT_THUMB_RADIUS_PX;
}

export function imagePreviewOriginRectFromElement(
  el: EventTarget | Element | null,
): ImagePreviewOriginRect | null {
  if (!el || typeof (el as Element).tagName !== "string") return null;
  const element = el as Element;
  const img = element.tagName === "IMG" ? element : element.querySelector("img");
  const frame = element.getBoundingClientRect();
  if (frame.width < 1 || frame.height < 1) return null;
  const radius = Math.max(
    visibleBorderRadiusPx(element),
    img ? visibleBorderRadiusPx(img) : 0,
    DEFAULT_THUMB_RADIUS_PX,
  );
  const naturalImg = img && img.tagName === "IMG" ? (img as HTMLImageElement) : null;
  return {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    radius,
    naturalWidth: naturalImg && naturalImg.naturalWidth > 0 ? naturalImg.naturalWidth : undefined,
    naturalHeight: naturalImg && naturalImg.naturalHeight > 0 ? naturalImg.naturalHeight : undefined,
  };
}

export function imagePreviewStageRect(
  viewport: { width: number; height: number },
  toolbarHeight = IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX,
): {
  left: number;
  top: number;
  width: number;
  height: number;
  toolbarGap: number;
} {
  const width = Math.max(1, Math.round(viewport.width * IMAGE_PREVIEW_STAGE_RATIO));
  const left = Math.round((viewport.width - width) / 2);
  const pillHeight = Math.max(1, Math.ceil(toolbarHeight));
  const minGap = IMAGE_PREVIEW_MIN_EDGE_GAP_PX;
  let toolbarGap = IMAGE_PREVIEW_TOOLBAR_GAP_PX;
  let topGap = IMAGE_PREVIEW_TOOLBAR_TOP_GAP_PX;
  let top = topGap + pillHeight + toolbarGap;
  let bottomInset = Math.max(
    0,
    Math.round(viewport.height * (1 - IMAGE_PREVIEW_STAGE_RATIO) / 2),
  );

  if (top + bottomInset >= viewport.height) {
    bottomInset = Math.max(0, viewport.height - top);
  }
  if (top >= viewport.height) {
    toolbarGap = minGap;
    topGap = minGap;
    top = topGap + pillHeight + toolbarGap;
    if (top >= viewport.height) {
      top = Math.max(minGap, viewport.height - minGap);
    }
    bottomInset = 0;
  }

  const height = Math.max(1, viewport.height - top - bottomInset);
  return { left, top, width, height, toolbarGap };
}

/** Display size inside the stage: natural pixels when they fit, otherwise contain. */
export function imagePreviewContainedSize(
  natural: { width: number; height: number } | null | undefined,
  box: { width: number; height: number },
): { width: number; height: number } {
  if (!natural || natural.width < 1 || natural.height < 1) {
    return { width: 0, height: 0 };
  }
  if (natural.width <= box.width && natural.height <= box.height) {
    return { width: natural.width, height: natural.height };
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

export function imagePreviewTargetRect(
  origin: ImagePreviewOriginRect,
  viewport: { width: number; height: number },
  toolbarHeight = IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX,
): ImagePreviewOriginRect {
  const stage = imagePreviewStageRect(viewport, toolbarHeight);
  return {
    left: stage.left,
    top: stage.top,
    width: stage.width,
    height: stage.height,
    radius: origin.radius ?? DEFAULT_THUMB_RADIUS_PX,
  };
}

export function imagePreviewImageRect(
  origin: ImagePreviewOriginRect,
  viewport: { width: number; height: number },
  natural?: { width: number; height: number } | null,
  toolbarHeight = IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX,
): ImagePreviewOriginRect {
  const stage = imagePreviewStageRect(viewport, toolbarHeight);
  const size = imagePreviewContainedSize(
    natural
    ?? (origin.naturalWidth && origin.naturalHeight
      ? { width: origin.naturalWidth, height: origin.naturalHeight }
      : null),
    stage,
  );
  return {
    left: stage.left + Math.round((stage.width - size.width) / 2),
    top: stage.top + Math.round((stage.height - size.height) / 2),
    width: size.width,
    height: size.height,
    radius: origin.radius ?? DEFAULT_THUMB_RADIUS_PX,
  };
}

export function imagePreviewZoomTransform(
  origin: ImagePreviewOriginRect,
  target: ImagePreviewOriginRect,
): { x: number; y: number; scale: number } {
  return {
    x: origin.left + origin.width / 2 - (target.left + target.width / 2),
    y: origin.top + origin.height / 2 - (target.top + target.height / 2),
    scale: origin.width / Math.max(target.width, 1),
  };
}

/** CSS radius that still looks like `visualRadius` after `transform: scale(scale)`. */
export function imagePreviewScaledRadius(visualRadius: number, scale: number): number {
  return visualRadius / Math.max(scale, 0.001);
}

function transformCss(x: number, y: number, scale: number): string {
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

function clampUserZoom(value: number): number {
  return Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, value));
}

function readViewport(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function originNaturalSize(
  origin: ImagePreviewOriginRect | null | undefined,
): { width: number; height: number } | null {
  if (!origin?.naturalWidth || !origin.naturalHeight) return null;
  if (origin.naturalWidth < 1 || origin.naturalHeight < 1) return null;
  return { width: origin.naturalWidth, height: origin.naturalHeight };
}

export function ImagePreviewOverlay({
  alt,
  src,
  originRect = null,
  durationMs,
  onClose,
  onSaveAnnotation,
  annotationFileName,
}: ImagePreviewOverlayProps) {
  const t = useTranslations("shared.imagePreviewOverlay");
  const { menu, onContextMenu, closeMenu, imgRef } = useImageCopyMenu();
  const reduceMotion =
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = durationMs ?? (reduceMotion ? 0 : IMAGE_PREVIEW_ZOOM_MS);
  const [opened, setOpened] = React.useState(duration <= 0);
  const [closing, setClosing] = React.useState(false);
  const [userZoom, setUserZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [drawing, setDrawing] = React.useState(false);
  const [strokes, setStrokes] = React.useState<AnnotateStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = React.useState<AnnotateStroke[]>([]);
  const [savingAnnotation, setSavingAnnotation] = React.useState(false);
  const finishedRef = React.useRef(false);
  const draggingRef = React.useRef(false);
  const didDragRef = React.useRef(false);
  const dragRef = React.useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const clipRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const annotatingRef = React.useRef(false);
  const [viewport, setViewport] = React.useState(() => readViewport());
  const [toolbarHeight, setToolbarHeight] = React.useState(IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX);
  const [natural, setNatural] = React.useState<{ width: number; height: number } | null>(() =>
    originNaturalSize(originRect),
  );
  const canAnnotate = typeof onSaveAnnotation === "function";

  const finishClose = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClose();
  }, [onClose]);

  const requestClose = React.useCallback(() => {
    if (closing || finishedRef.current) return;
    setUserZoom(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    setDrawing(false);
    setStrokes([]);
    setRedoStrokes([]);
    draggingRef.current = false;
    annotatingRef.current = false;
    if (duration <= 0) {
      finishClose();
      return;
    }
    setClosing(true);
  }, [closing, duration, finishClose]);

  React.useLayoutEffect(() => {
    if (duration <= 0) return;
    const frame = window.requestAnimationFrame(() => setOpened(true));
    return () => window.cancelAnimationFrame(frame);
  }, [duration]);

  React.useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishClose, duration + 40);
    return () => window.clearTimeout(timer);
  }, [closing, duration, finishClose]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) return;
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menu, requestClose]);

  React.useEffect(() => {
    const handleResize = () => setViewport(readViewport());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    const next = originNaturalSize(originRect);
    if (next) setNatural(next);
  }, [originRect]);

  const stage = imagePreviewStageRect(viewport, toolbarHeight);
  const imageTarget = imagePreviewImageRect(
    originRect ?? {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      radius: DEFAULT_THUMB_RADIUS_PX,
    },
    viewport,
    natural,
    toolbarHeight,
  );
  const imageSize = { width: imageTarget.width, height: imageTarget.height };
  const fromOrigin = originRect
    ? imagePreviewZoomTransform(originRect, imageTarget)
    : { x: 0, y: 0, scale: 0.96 };
  const expanded = opened && !closing;
  const motion = expanded
    ? { x: 0, y: 0, scale: 1 }
    : { x: fromOrigin.x, y: fromOrigin.y, scale: fromOrigin.scale };
  const userTransform = `translate(${pan.x}px, ${pan.y}px) scale(${userZoom})`;
  const visualRadius = Math.max(originRect?.radius ?? DEFAULT_THUMB_RADIUS_PX, DEFAULT_THUMB_RADIUS_PX);
  const borderRadius = expanded
    ? 0
    : imagePreviewScaledRadius(visualRadius, fromOrigin.scale);
  const radiusClip = `inset(0 round ${borderRadius}px)`;
  const transition = duration <= 0
    ? "none"
    : [
        `transform ${duration}ms ${ZOOM_EASE}`,
        `opacity ${duration}ms ${ZOOM_EASE}`,
        `border-radius ${duration}ms ${ZOOM_EASE}`,
        `clip-path ${duration}ms ${ZOOM_EASE}`,
      ].join(", ");
  const stageFade = duration <= 0 ? "none" : `opacity ${duration}ms ${ZOOM_EASE}`;

  React.useLayoutEffect(() => {
    if (!expanded) return;
    const el = toolbarRef.current;
    if (!el) return;
    const read = () => {
      const next = Math.ceil(el.getBoundingClientRect().height);
      if (next < 1) return;
      setToolbarHeight((current) => (current === next ? current : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, drawing, canAnnotate]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (drawing) return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    didDragRef.current = false;
    setDragging(true);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [drawing, pan]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDragRef.current = true;
    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    });
  }, []);

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    setDragging(false);
    if (typeof event.currentTarget.releasePointerCapture !== "function") return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer was not captured in this environment.
    }
  }, []);

  const cssSize = {
    width: Math.max(0, imageSize.width),
    height: Math.max(0, imageSize.height),
  };
  const mediaReady = cssSize.width >= 1 && cssSize.height >= 1;

  const rememberNaturalSize = React.useCallback((image: HTMLImageElement | null) => {
    if (!image || image.naturalWidth < 1 || image.naturalHeight < 1) return;
    setNatural((current) => {
      if (current && current.width === image.naturalWidth && current.height === image.naturalHeight) {
        return current;
      }
      return { width: image.naturalWidth, height: image.naturalHeight };
    });
  }, []);

  React.useLayoutEffect(() => {
    rememberNaturalSize(imgRef.current);
  }, [imgRef, rememberNaturalSize, src]);

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(1, Math.round(cssSize.width));
    const height = Math.max(1, Math.round(cssSize.height));
    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    paintAnnotateStrokes(ctx, strokes, 1);
  }, [cssSize.height, cssSize.width, strokes]);

  const handleAnnotatePointerDown = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    didDragRef.current = true;
    annotatingRef.current = true;
    const canvas = event.currentTarget;
    const width = Math.max(1, cssSize.width);
    const height = Math.max(1, cssSize.height);
    const point = pointerToCanvasPoint(event, canvas, width, height);
    setRedoStrokes([]);
    setStrokes((current) => [...current, { points: [point] }]);
    if (typeof canvas.setPointerCapture === "function") {
      canvas.setPointerCapture(event.pointerId);
    }
  }, [cssSize.height, cssSize.width, drawing]);

  const handleAnnotatePointerMove = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !annotatingRef.current) return;
    const canvas = event.currentTarget;
    const width = Math.max(1, cssSize.width);
    const height = Math.max(1, cssSize.height);
    const point = pointerToCanvasPoint(event, canvas, width, height);
    setStrokes((current) => {
      if (current.length === 0) return current;
      const next = current.slice();
      const last = next[next.length - 1]!;
      next[next.length - 1] = { points: [...last.points, point] };
      return next;
    });
  }, [cssSize.height, cssSize.width, drawing]);

  const handleAnnotatePointerUp = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    annotatingRef.current = false;
    if (typeof event.currentTarget.releasePointerCapture !== "function") return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer was not captured in this environment.
    }
  }, []);

  const handleSaveAnnotation = React.useCallback(() => {
    if (!onSaveAnnotation || strokes.length === 0 || savingAnnotation) return;
    setSavingAnnotation(true);
    void (async () => {
      const file = await fileFromAnnotatedImage({
        src,
        img: imgRef.current,
        strokes,
        cssWidth: Math.max(1, cssSize.width),
        cssHeight: Math.max(1, cssSize.height),
        fileName: annotatedFileName(annotationFileName ?? alt),
      });
      setSavingAnnotation(false);
      if (!file) {
        toastManager.add({
          title: t("saveAnnotationFailedTitle"),
          description: t("saveAnnotationUnavailable"),
          type: "error",
        });
        return;
      }
      await onSaveAnnotation(file);
      requestClose();
    })();
  }, [
    alt,
    annotationFileName,
    cssSize.height,
    cssSize.width,
    imgRef,
    onSaveAnnotation,
    requestClose,
    savingAnnotation,
    src,
    strokes,
    t,
  ]);

  const handleCopy = React.useCallback(() => {
    void copyImageSrcToClipboard(src, imgRef.current).then((ok) => {
      if (ok) return;
      toastManager.add({
        title: t("copyFailedTitle"),
        description: t("clipboardUnavailable"),
        type: "error",
      });
    });
  }, [imgRef, src, t]);

  const handleDownload = React.useCallback(() => {
    void (async () => {
      const result = await saveImageSrcToDisk(src, undefined, imgRef.current);
      if (result === "saved" || result === "cancelled") return;
      toastManager.add({
        title: t("saveFailedTitle"),
        description: t("saveUnavailable"),
        type: "error",
      });
    })();
  }, [imgRef, src, t]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-image-preview-overlay=""
      data-image-preview-closing={closing ? "" : undefined}
      className="fixed inset-0 z-[2147483647] cursor-zoom-out"
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        if (menu) {
          closeMenu();
          return;
        }
        requestClose();
      }}
      onContextMenu={onContextMenu}
    >
      <div
        aria-hidden="true"
        data-image-preview-backdrop=""
        className="absolute inset-0 bg-black/80"
        style={{
          opacity: expanded ? 1 : 0,
          transition: duration <= 0 ? "none" : `opacity ${duration}ms ${ZOOM_EASE}`,
        }}
      />
      <div
        data-image-preview-frame=""
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "fixed",
          top: stage.top,
          left: stage.left,
          width: stage.width,
          height: stage.height,
          borderRadius: STAGE_RADIUS_PX,
          overflow: "visible",
        }}
        className="z-10 cursor-default"
      >
        <div
          aria-hidden="true"
          data-image-preview-stage=""
          className="absolute inset-0 bg-white/10 ring-1 ring-inset ring-white/20"
          style={{
            borderRadius: STAGE_RADIUS_PX,
            opacity: expanded ? 1 : 0,
            transition: stageFade,
          }}
        />
        {expanded ? (
          <div
            ref={toolbarRef}
            data-image-preview-toolbar=""
            className="pointer-events-auto absolute right-0 z-30"
            style={{
              bottom: "100%",
              marginBottom: stage.toolbarGap,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-0.5 rounded-full border border-white/15 bg-neutral-950/80 p-1 text-white shadow-lg backdrop-blur-md">
              {canAnnotate && drawing ? (
                <>
                  <ImagePreviewToolbarButton
                    action="save-annotation"
                    label={t("saveAnnotation")}
                    disabled={strokes.length === 0 || savingAnnotation}
                    onClick={handleSaveAnnotation}
                  >
                    <Save className="size-4" />
                  </ImagePreviewToolbarButton>
                  <ImagePreviewToolbarButton
                    action="undo"
                    label={t("undo")}
                    disabled={strokes.length === 0}
                    onClick={() => {
                      if (strokes.length === 0) return;
                      const last = strokes[strokes.length - 1]!;
                      setStrokes(strokes.slice(0, -1));
                      setRedoStrokes([...redoStrokes, last]);
                    }}
                  >
                    <Undo2 className="size-4" />
                  </ImagePreviewToolbarButton>
                  <ImagePreviewToolbarButton
                    action="redo"
                    label={t("redo")}
                    disabled={redoStrokes.length === 0}
                    onClick={() => {
                      if (redoStrokes.length === 0) return;
                      const restored = redoStrokes[redoStrokes.length - 1]!;
                      setRedoStrokes(redoStrokes.slice(0, -1));
                      setStrokes([...strokes, restored]);
                    }}
                  >
                    <Redo2 className="size-4" />
                  </ImagePreviewToolbarButton>
                </>
              ) : null}
              {canAnnotate ? (
                <ImagePreviewToolbarButton
                  action="draw"
                  label={t("draw")}
                  pressed={drawing}
                  onClick={() => setDrawing((value) => !value)}
                >
                  <PencilSparkles className="size-4" />
                </ImagePreviewToolbarButton>
              ) : null}
              <ImagePreviewToolbarButton
                action="zoom-out"
                label={t("zoomOut")}
                disabled={userZoom <= USER_ZOOM_MIN}
                onClick={() => setUserZoom((value) => clampUserZoom(value - USER_ZOOM_STEP))}
              >
                <ZoomOut className="size-4" />
              </ImagePreviewToolbarButton>
              <ImagePreviewToolbarButton
                action="zoom-in"
                label={t("zoomIn")}
                disabled={userZoom >= USER_ZOOM_MAX}
                onClick={() => setUserZoom((value) => clampUserZoom(value + USER_ZOOM_STEP))}
              >
                <ZoomIn className="size-4" />
              </ImagePreviewToolbarButton>
              <ImagePreviewToolbarButton
                action="copy"
                label={t("copyImage")}
                onClick={handleCopy}
              >
                <Copy className="size-4" />
              </ImagePreviewToolbarButton>
              <ImagePreviewToolbarButton
                action="download"
                label={t("downloadImage")}
                onClick={handleDownload}
              >
                <Download className="size-4" />
              </ImagePreviewToolbarButton>
              <ImagePreviewToolbarButton
                action="close"
                label={t("close")}
                onClick={requestClose}
              >
                <X className="size-4" />
              </ImagePreviewToolbarButton>
            </div>
          </div>
        ) : null}
        <div
          ref={clipRef}
          data-image-preview-canvas=""
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: expanded ? "hidden" : "visible",
            borderRadius: STAGE_RADIUS_PX,
            touchAction: "none",
            cursor: drawing ? "crosshair" : dragging ? "grabbing" : "grab",
          }}
        >
          <div
            data-image-preview-media=""
            style={{
              position: "relative",
              width: mediaReady ? cssSize.width : "auto",
              height: mediaReady ? cssSize.height : "auto",
              maxWidth: "100%",
              maxHeight: "100%",
              flexShrink: 0,
              overflow: "hidden",
              borderRadius,
              clipPath: radiusClip,
              transform: transformCss(motion.x, motion.y, motion.scale),
              transformOrigin: "center center",
              transition,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object/data URLs and must not go through Next image optimization. */}
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              draggable={false}
              className="pointer-events-none block h-full w-full select-none object-contain"
              style={{
                borderRadius: "inherit",
                transform: userTransform,
                transformOrigin: "center center",
              }}
              onLoad={(event) => rememberNaturalSize(event.currentTarget)}
            />
            {canAnnotate ? (
              <canvas
                ref={canvasRef}
                data-image-preview-annotate=""
                className="absolute inset-0"
                style={{
                  transform: userTransform,
                  transformOrigin: "center center",
                  pointerEvents: drawing ? "auto" : "none",
                  cursor: drawing ? "crosshair" : "inherit",
                }}
                onPointerDown={handleAnnotatePointerDown}
                onPointerMove={handleAnnotatePointerMove}
                onPointerUp={handleAnnotatePointerUp}
                onPointerCancel={handleAnnotatePointerUp}
              />
            ) : null}
          </div>
        </div>
      </div>
      {menu ? (
        <ImageCopyContextMenu
          src={src}
          imgRef={imgRef}
          position={menu}
          onClose={closeMenu}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function ImagePreviewToolbarButton({
  action,
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  action:
    | "zoom-out"
    | "zoom-in"
    | "copy"
    | "download"
    | "close"
    | "draw"
    | "undo"
    | "redo"
    | "save-annotation";
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      data-image-preview-toolbar-action={action}
      className={
        pressed
          ? "inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40"
          : "inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
