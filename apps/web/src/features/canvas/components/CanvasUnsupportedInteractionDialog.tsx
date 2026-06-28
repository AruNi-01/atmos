"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { ArrowUpRight, Compass } from "lucide-react";
import { Button } from "@workspace/ui";

import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";

function removeCanvasParam(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }
  try {
    const url = new URL(path, window.location.origin);
    url.searchParams.delete("canvas");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

/**
 * Notice modal shown when a clickable element inside a Canvas widget triggers an
 * action that has no Canvas equivalent (M20). Rendered through a portal above
 * the `z-[150]` Canvas overlay so it is never hidden behind the board.
 */
export function CanvasUnsupportedInteractionDialog() {
  const t = useTranslations("canvas.unsupportedInteraction");
  const notice = useCanvasRuntimeStore((state) => state.unsupportedInteractionNotice);
  const dismiss = useCanvasRuntimeStore((state) => state.dismissUnsupportedInteraction);
  const router = useAppRouter();

  React.useEffect(() => {
    if (!notice) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [dismiss, notice]);

  if (!notice || typeof document === "undefined") {
    return null;
  }

  const handleOpenInMainApp = () => {
    if (!notice.targetPath) {
      return;
    }
    const targetPath = removeCanvasParam(notice.targetPath);
    dismiss();
    router.push(targetPath);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dialogAria")}
      className="fixed inset-0 z-[300] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div className="relative z-[1] w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Compass className="size-4.5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">
              {notice.widgetLabel
                ? t("descriptionNamed", { widgetLabel: notice.widgetLabel })
                : t("descriptionFallback")}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss}>
            {t("actions.dismiss")}
          </Button>
          {notice.targetPath ? (
            <Button size="sm" onClick={handleOpenInMainApp}>
              <ArrowUpRight className="mr-1.5 size-3.5" />
              {t("actions.openInMainApp")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
