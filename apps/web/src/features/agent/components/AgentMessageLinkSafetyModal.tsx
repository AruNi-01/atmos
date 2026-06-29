"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown";
import { CheckIcon, CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { cn } from "@workspace/ui";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
}

function AgentMessageLinkSafetyModal({
  isOpen,
  onClose,
  onConfirm,
  url,
}: LinkSafetyModalProps) {
  const t = useTranslations("Agent.components");
  const [mounted, setMounted] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const copyButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const copiedResetTimeoutRef = React.useRef<number | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(
    () => () => {
      if (copiedResetTimeoutRef.current) {
        window.clearTimeout(copiedResetTimeoutRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!(isOpen && mounted)) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCopied(false);

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const firstFocusable = copyButtonRef.current ?? focusableElements(dialog)[0];
      (firstFocusable ?? dialog)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) {
        event.preventDefault();
        return;
      }

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const activeInsideDialog = active ? dialog.contains(active) : false;

      if (!activeInsideDialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
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
      const previousFocus = previousFocusRef.current;
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus();
      }
      previousFocusRef.current = null;
    };
  }, [isOpen, mounted, onClose]);

  const handleCopy = React.useCallback(async () => {
    if (!navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copiedResetTimeoutRef.current) {
        window.clearTimeout(copiedResetTimeoutRef.current);
      }
      copiedResetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard writes can be unavailable in embedded or restricted contexts.
    }
  }, [url]);

  const handleConfirm = React.useCallback(() => {
    onConfirm();
    onClose();
  }, [onClose, onConfirm]);

  if (!(isOpen && mounted)) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-background/50 backdrop-blur-sm"
      data-streamdown="link-safety-modal"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative mx-4 flex w-full max-w-md flex-col gap-4 rounded-xl border bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        <button
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          onClick={onClose}
          title={t("linkSafety.closeTitle")}
          type="button"
        >
          <XIcon size={16} />
        </button>
        <div className="flex flex-col gap-2">
          <div id={titleId} className="flex items-center gap-2 text-lg font-semibold">
            <ExternalLinkIcon size={20} />
            <span>{t("linkSafety.title")}</span>
          </div>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {t("linkSafety.description")}
          </p>
        </div>
        <div
          className={cn(
            "break-all rounded-md bg-muted p-3 font-mono text-sm",
            url.length > 100 && "max-h-32 overflow-y-auto",
          )}
        >
          {url}
        </div>
        <div className="flex gap-2">
          <button
            ref={copyButtonRef}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium transition-all hover:bg-muted"
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <>
                <CheckIcon size={14} />
                <span>{t("linkSafety.copied")}</span>
              </>
            ) : (
              <>
                <CopyIcon size={14} />
                <span>{t("linkSafety.copyLink")}</span>
              </>
            )}
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
            onClick={handleConfirm}
            type="button"
          >
            <ExternalLinkIcon size={14} />
            <span>{t("linkSafety.openLink")}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const agentMessageLinkSafety: LinkSafetyConfig = {
  enabled: true,
  renderModal: (props) => <AgentMessageLinkSafetyModal {...props} />,
};
