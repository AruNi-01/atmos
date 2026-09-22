"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyAction, IconDiscovery } from "@workspace/ui";
import { desktopInvoke } from "@/shared/lib/desktop-bridge";
import { PageEmptyState } from "@/shared/components/PageEmptyState";
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
    <PageEmptyState
      icon={<IconDiscovery />}
      title={title}
      description={error ? `${body} ${error}` : body}
      actions={
        showChooser ? (
          <>
            {platforms.includes("ios") ? (
              <EmptyAction
                icon={<SimulatorPlatformIcon platform="ios" />}
                onClick={() => onStart("ios")}
              >
                {t("actions.startIos")}
              </EmptyAction>
            ) : null}
            {platforms.includes("android") ? (
              <EmptyAction
                emphasis={platforms.includes("ios") ? "secondary" : "primary"}
                icon={<SimulatorPlatformIcon platform="android" />}
                onClick={() => onStart("android")}
              >
                {t("actions.startAndroid")}
              </EmptyAction>
            ) : null}
          </>
        ) : action ? (
          <EmptyAction onClick={onAction}>{t(`actions.${action.id}`)}</EmptyAction>
        ) : undefined
      }
    />
  );
}
