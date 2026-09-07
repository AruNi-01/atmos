"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui";
import { desktopInvoke } from "@/shared/lib/desktop-bridge";
import { startablePlatforms } from "../types";
import type {
  SimulatorDevicePlatform,
  SimulatorProbe,
  SimulatorReason,
  SimulatorSetupAction,
} from "../types";
import { SimulatorPlatformIcon } from "./SimulatorTabIcon";

export function SimulatorSetupCard({
  reason,
  error,
  action,
  probe,
  onStart,
  onRetry,
}: {
  reason: SimulatorReason;
  error?: string | null;
  action: SimulatorSetupAction | null;
  probe?: SimulatorProbe | null;
  onStart: (platform: SimulatorDevicePlatform) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("features.simulator");
  const platforms = startablePlatforms(probe);
  const showChooser =
    (reason === "ok" || reason === "helper_missing") && platforms.length > 0;
  const title = showChooser
    ? t("choosePlatform.title")
    : t(`reasons.${reason}.title`);
  const body = showChooser
    ? t("choosePlatform.body")
    : t(`reasons.${reason}.body`);

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
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="space-y-1.5">
          <h2 className="text-base font-medium text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{body}</p>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        {showChooser ? (
          <div className="flex w-full gap-2">
            {platforms.includes("ios") ? (
              <Button
                type="button"
                size="xl"
                className="min-w-0 flex-1"
                onClick={() => onStart("ios")}
              >
                <SimulatorPlatformIcon platform="ios" className="size-5" />
                {t("actions.startIos")}
              </Button>
            ) : null}
            {platforms.includes("android") ? (
              <Button
                type="button"
                size="xl"
                className="min-w-0 flex-1"
                onClick={() => onStart("android")}
              >
                <SimulatorPlatformIcon platform="android" className="size-5" />
                {t("actions.startAndroid")}
              </Button>
            ) : null}
          </div>
        ) : action ? (
          <Button type="button" size="xl" className="w-full" onClick={onAction}>
            {t(`actions.${action.id}`)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
