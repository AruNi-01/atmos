"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  ImageCopyContextMenu,
  useImageCopyMenu,
} from "@/shared/components/image-copy-context-menu";

type ImagePreviewOverlayProps = {
  alt: string;
  src: string;
  onClose: () => void;
};

export function ImagePreviewOverlay({
  alt,
  src,
  onClose,
}: ImagePreviewOverlayProps) {
  const { menu, onContextMenu, closeMenu, imgRef } = useImageCopyMenu();

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) return;
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menu, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-image-preview-overlay=""
      className="fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={() => {
        if (menu) {
          closeMenu();
          return;
        }
        onClose();
      }}
      onContextMenu={onContextMenu}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object/data URLs and must not go through Next image optimization. */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-[92vw] cursor-zoom-out rounded-md object-contain shadow-2xl"
      />
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
