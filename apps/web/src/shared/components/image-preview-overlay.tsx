"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Copy, Download, Paintbrush, Redo2, Save, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { toastManager } from "@workspace/ui";
import {
  ImageCopyContextMenu,
  useImageCopyMenu,
} from "@/shared/components/image-copy-context-menu";
import { copyImageSrcToClipboard, saveImageSrcToDisk } from "@/shared/utils/copy-image";

export const IMAGE_PREVIEW_ZOOM_MS = 320;
export const IMAGE_PREVIEW_TOOLBAR_SPACE_PX = 48;
const USER_ZOOM_MIN = 0.5;
const USER_ZOOM_MAX = 3;
const USER_ZOOM_STEP = 0.25;
const TOOLBAR_GAP_PX = 8;
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

export function imagePreviewTargetRect(
  origin: ImagePreviewOriginRect,
  viewport: { width: number; height: number },
  natural?: { width: number; height: number } | null,
  toolbarSpace = IMAGE_PREVIEW_TOOLBAR_SPACE_PX,
): ImagePreviewOriginRect {
  const aspect =
    natural && natural.width > 0 && natural.height > 0
      ? natural.width / natural.height
      : origin.naturalWidth && origin.naturalHeight
        ? origin.naturalWidth / origin.naturalHeight
        : origin.width / Math.max(origin.height, 1);
  const maxW = viewport.width * 0.92;
  const maxH = Math.max(viewport.height * 0.92 - toolbarSpace, 1);
  let width = maxW;
  let height = width / aspect;
  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }
  let top = (viewport.height - height) / 2;
  if (top < toolbarSpace) top = toolbarSpace;
  return {
    left: (viewport.width - width) / 2,
    top,
    width,
    height,
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
  const annotatingRef = React.useRef(false);
  const [clipSize, setClipSize] = React.useState({ width: 0, height: 0 });
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

  const viewport =
    typeof window === "undefined"
      ? { width: 0, height: 0 }
      : { width: window.innerWidth, height: window.innerHeight };
  const display = originRect ? imagePreviewTargetRect(originRect, viewport) : null;
  const fromOrigin =
    originRect && display
      ? imagePreviewZoomTransform(originRect, display)
      : { x: 0, y: 0, scale: 0.96 };
  const expanded = opened && !closing;
  const motion = expanded ? { x: 0, y: 0, scale: 1, opacity: 1 } : {
    x: fromOrigin.x,
    y: fromOrigin.y,
    scale: fromOrigin.scale,
    opacity: originRect ? 1 : closing ? 0 : 1,
  };
  const visualRadius = Math.max(originRect?.radius ?? DEFAULT_THUMB_RADIUS_PX, DEFAULT_THUMB_RADIUS_PX);
  const expandedRadius = Math.max(visualRadius, 16);
  const borderRadius = expanded
    ? expandedRadius
    : imagePreviewScaledRadius(visualRadius, fromOrigin.scale);
  const transition = duration <= 0
    ? "none"
    : `transform ${duration}ms ${ZOOM_EASE}, opacity ${duration}ms ${ZOOM_EASE}, border-radius ${duration}ms ${ZOOM_EASE}`;

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

  const cssSize = display
    ? { width: display.width, height: display.height }
    : clipSize;

  React.useLayoutEffect(() => {
    const el = clipRef.current;
    if (!el) return;
    const measure = () => {
      setClipSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [display?.height, display?.width, expanded]);

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
      className={
        display
          ? "fixed inset-0 z-[2147483647] cursor-zoom-out"
          : "fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center"
      }
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
          ...(display
            ? {
                position: "fixed" as const,
                top: display.top,
                left: display.left,
                width: display.width,
                height: display.height,
                transformOrigin: "center center",
              }
            : {
                position: "relative" as const,
                maxHeight: "92vh",
                maxWidth: "92vw",
              }),
          transform: transformCss(motion.x, motion.y, motion.scale),
          opacity: motion.opacity,
          transition,
        }}
        className="z-10 cursor-default"
      >
        {expanded ? (
          <div
            data-image-preview-toolbar=""
            className="absolute right-0 z-20"
            style={{ bottom: "100%", marginBottom: TOOLBAR_GAP_PX }}
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
                  <Paintbrush className="size-4" />
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
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius,
            overflow: "hidden",
            clipPath: `inset(0 round ${borderRadius}px)`,
            touchAction: "none",
            cursor: drawing ? "crosshair" : dragging ? "grabbing" : "grab",
            transition: duration <= 0
              ? "none"
              : `border-radius ${duration}ms ${ZOOM_EASE}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object/data URLs and must not go through Next image optimization. */}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            className="pointer-events-none block h-full w-full select-none object-cover"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${userZoom})`,
              transformOrigin: "center center",
            }}
          />
          {canAnnotate ? (
            <canvas
              ref={canvasRef}
              data-image-preview-annotate=""
              className="absolute inset-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${userZoom})`,
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
