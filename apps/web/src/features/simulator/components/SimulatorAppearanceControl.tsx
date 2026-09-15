"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui";
import { simulatorApi, type SimulatorAppearance } from "@/api/ws/simulator-api";
import {
  parseSimulatorError,
  simulatorErrorText,
  type SimulatorChromeReason,
} from "../lib/simulator-errors";

export function SimulatorAppearanceControl({
  workspaceId,
  enabled,
}: {
  workspaceId: string | null;
  enabled: boolean;
}) {
  const t = useTranslations("features.simulator");
  const [appearance, setAppearance] = React.useState<SimulatorAppearance | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errorReason, setErrorReason] = React.useState<SimulatorChromeReason | null>(null);

  React.useEffect(() => {
    if (!enabled || !workspaceId) {
      setAppearance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await simulatorApi.appearanceGet(workspaceId);
        if (cancelled) return;
        setAppearance(result.appearance);
        setError(null);
        setErrorReason(null);
      } catch (err) {
        if (cancelled) return;
        setErrorReason(parseSimulatorError(err));
        setError(simulatorErrorText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceId]);

  const onChange = React.useCallback(
    async (next: string) => {
      if (next !== "light" && next !== "dark") return;
      if (!workspaceId || !enabled) return;
      setBusy(true);
      setError(null);
      setErrorReason(null);
      try {
        const result = await simulatorApi.appearanceSet(workspaceId, next);
        setAppearance(result.appearance);
      } catch (err) {
        setErrorReason(parseSimulatorError(err));
        setError(simulatorErrorText(err));
      } finally {
        setBusy(false);
      }
    },
    [enabled, workspaceId],
  );

  if (!enabled) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("appearance")}</span>
        <ToggleGroup
          type="single"
          size="sm"
          value={appearance ?? ""}
          onValueChange={(next) => {
            void onChange(next);
          }}
          disabled={!workspaceId || busy}
          variant="outline"
        >
          <ToggleGroupItem value="light">{t("light")}</ToggleGroupItem>
          <ToggleGroupItem value="dark">{t("dark")}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {errorReason || error ? (
        <p className="text-xs text-destructive">
          {errorReason ? t(`reasons.${errorReason}.title`) : error}
        </p>
      ) : null}
    </div>
  );
}
