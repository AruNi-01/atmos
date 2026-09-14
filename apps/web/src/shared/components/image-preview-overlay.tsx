"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Copy, Download, X, ZoomIn, ZoomOut } from "lucide-react";
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
};

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
  const finishedRef = React.useRef(false);

  const finishClose = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClose();
  }, [onClose]);

  const requestClose = React.useCallback(() => {
    if (closing || finishedRef.current) return;
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
  const fit = originRect ? imagePreviewTargetRect(originRect, viewport) : null;
  const display = fit
    ? {
        ...fit,
        width: fit.width * userZoom,
        height: fit.height * userZoom,
        left: (viewport.width - fit.width * userZoom) / 2,
        top: Math.max(
          IMAGE_PREVIEW_TOOLBAR_SPACE_PX,
          (viewport.height - fit.height * userZoom) / 2,
        ),
      }
    : null;
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
          style={{
            width: "100%",
            height: "100%",
            borderRadius,
            overflow: "hidden",
            clipPath: `inset(0 round ${borderRadius}px)`,
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
            className="block h-full w-full object-cover"
          />
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
  onClick,
  children,
}: {
  action: "zoom-out" | "zoom-in" | "copy" | "download" | "close";
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-image-preview-toolbar-action={action}
      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
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
