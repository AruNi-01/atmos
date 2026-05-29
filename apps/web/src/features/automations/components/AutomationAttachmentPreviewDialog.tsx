"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type PreviewAttachment = {
  filename: string;
  objectUrl: string;
};

const PREVIEW_FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function AutomationAttachmentPreviewDialog({
  attachment,
  onClose,
}: {
  attachment: PreviewAttachment | null;
  onClose: () => void;
}) {
  const previewDialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!attachment || typeof document === "undefined") return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = previewDialogRef.current;
      if (!dialog) return;
      const firstFocusable = dialog.querySelector<HTMLElement>(
        PREVIEW_FOCUSABLE_SELECTOR,
      );
      (firstFocusable ?? dialog).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = previewDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(PREVIEW_FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus && document.contains(previousFocus)) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
    };
  }, [attachment, onClose]);

  if (!attachment || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={previewDialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview attachment ${attachment.filename}`}
      tabIndex={-1}
      className="fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-md border border-white/20 bg-black/40 text-white shadow-lg transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={onClose}
      >
        <X className="size-5" />
        <span className="sr-only">Close preview</span>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object URLs and must not go through Next image optimization. */}
      <img
        src={attachment.objectUrl}
        alt={attachment.filename}
        className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}
