"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui";
import { Smartphone } from "lucide-react";
import { desktopInvoke } from "@/shared/lib/desktop-bridge";
import type { SimulatorReason, SimulatorSetupAction } from "../types";

export function SimulatorSetupCard({
  reason,
  error,
  action,
  onRetry,
}: {
  reason: SimulatorReason;
  error?: string | null;
  action: SimulatorSetupAction | null;
  onRetry: () => void;
}) {
  const t = useTranslations("features.simulator");
  const title = t(`reasons.${reason}.title`);
  const body = t(`reasons.${reason}.body`);

  const onAction = React.useCallback(() => {
    if (!action) return;
    if (action.kind === "retry") {
      onRetry();
      return;
    }
    if (action.href) {
      void desktopInvoke("open_external_url", { url: action.href }).catch(() => {
        window.open(action.href, "_blank", "noopener,noreferrer");
      });
    }
  }, [action, onRetry]);

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-start gap-4 rounded-xl border border-border/70 bg-card/60 p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Smartphone className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{body}</p>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        {action ? (
          <Button type="button" onClick={onAction}>
            {t(`actions.${action.id}`)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
