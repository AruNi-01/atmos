"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Code2, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui";

import {
  getDocumentScriptHost,
  type DocumentScriptStatus,
} from "../lib/document-script-host";

export function CanvasDocumentScriptStatus({ className }: { className?: string }) {
  const t = useTranslations("Canvas.script");
  const [status, setStatus] = React.useState<DocumentScriptStatus>(() =>
    getDocumentScriptHost().getStatus(),
  );

  React.useEffect(() => {
    return getDocumentScriptHost().subscribe(setStatus);
  }, []);

  if (status.state === "idle" || status.state === "stopped") {
    return null;
  }

  if (status.state === "running") {
    return (
      <div
        className={cn(
          "pointer-events-none absolute bottom-3 left-3 z-[50] flex max-w-sm items-center gap-1.5 rounded-md border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur",
          className,
        )}
        title={t("runningTitle")}
      >
        <Code2 className="size-3.5 shrink-0 text-emerald-500" />
        <span className="truncate">
          {t("running", { entry: status.entry ?? "main.js" })}
        </span>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div
        className={cn(
          "absolute bottom-3 left-3 z-[50] max-w-md rounded-md border border-destructive/40 bg-background/95 px-2 py-1.5 text-[11px] shadow-sm backdrop-blur",
          className,
        )}
      >
        <div className="flex items-start gap-1.5 text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">{t("errorTitle")}</div>
            <div className="mt-0.5 break-words text-muted-foreground">
              {status.error ?? t("errorUnknown")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("absolute bottom-3 left-3 z-[50]", className)}>
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    </div>
  );
}
