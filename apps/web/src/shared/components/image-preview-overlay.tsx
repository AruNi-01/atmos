"use client";

import React from "react";
import { createPortal } from "react-dom";

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
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object/data URLs and must not go through Next image optimization. */}
      <img
        src={src}
        alt={alt}
        className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
