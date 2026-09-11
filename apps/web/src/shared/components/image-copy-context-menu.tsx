"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { toastManager } from "@workspace/ui";
import { copyImageSrcToClipboard } from "@/shared/utils/copy-image";

export type ImageCopyMenuPosition = {
  x: number;
  y: number;
};

const CONTEXT_MENU_WIDTH = 180;
const CONTEXT_MENU_HEIGHT = 40;
const CONTEXT_MENU_PAD = 8;

export function imageCopyMenuPosition(
  event: React.MouseEvent,
): ImageCopyMenuPosition {
  const maxX = Math.max(
    CONTEXT_MENU_PAD,
    window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_PAD,
  );
  const maxY = Math.max(
    CONTEXT_MENU_PAD,
    window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_PAD,
  );
  return {
    x: Math.min(Math.max(CONTEXT_MENU_PAD, event.clientX), maxX),
    y: Math.min(Math.max(CONTEXT_MENU_PAD, event.clientY), maxY),
  };
}

function imageFromEventTarget(target: EventTarget | null): HTMLImageElement | null {
  if (!target || typeof (target as Element).tagName !== "string") return null;
  const el = target as Element;
  if (el.tagName === "IMG") return el as HTMLImageElement;
  return el.querySelector("img");
}

export function useImageCopyMenu() {
  const [menu, setMenu] = React.useState<ImageCopyMenuPosition | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  const closeMenu = React.useCallback(() => {
    setMenu(null);
  }, []);

  const onContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const img = imageFromEventTarget(event.currentTarget);
    if (img) imgRef.current = img;
    setMenu(imageCopyMenuPosition(event));
  }, []);

  React.useEffect(() => {
    if (!menu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target &&
        typeof (target as Element).closest === "function" &&
        (target as Element).closest("[data-image-preview-context-menu]")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [menu]);

  return { menu, onContextMenu, closeMenu, imgRef };
}

export function ImageCopyContextMenu({
  src,
  imgRef,
  position,
  onClose,
}: {
  src: string;
  imgRef?: React.RefObject<HTMLImageElement | null>;
  position: ImageCopyMenuPosition;
  onClose: () => void;
}) {
  const t = useTranslations("shared.imagePreviewOverlay");

  const handleCopyImage = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    void copyImageSrcToClipboard(src, imgRef?.current).then((ok) => {
      if (ok) return;
      toastManager.add({
        title: t("copyFailedTitle"),
        description: t("clipboardUnavailable"),
        type: "error",
      });
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="menu"
      data-image-preview-context-menu=""
      aria-label={t("copyImage")}
      className="fixed z-[2147483647] min-w-36 cursor-default overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: position.x, top: position.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        ref={(el) => {
          el?.focus({ preventScroll: true });
        }}
        type="button"
        role="menuitem"
        data-image-preview-copy=""
        className="relative flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
        onClick={handleCopyImage}
      >
        <Copy className="size-3.5 text-muted-foreground" />
        {t("copyImage")}
      </button>
    </div>,
    document.body,
  );
}

export function ImageCopyMenuHost({
  src,
  children,
}: {
  src: string;
  children: React.ReactNode;
}) {
  const { menu, onContextMenu, closeMenu, imgRef } = useImageCopyMenu();

  return (
    <span className="contents" onContextMenu={onContextMenu}>
      {children}
      {menu ? (
        <ImageCopyContextMenu
          src={src}
          imgRef={imgRef}
          position={menu}
          onClose={closeMenu}
        />
      ) : null}
    </span>
  );
}
