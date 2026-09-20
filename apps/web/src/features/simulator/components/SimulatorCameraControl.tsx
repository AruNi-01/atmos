"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ToggleGroup, ToggleGroupItem } from "@workspace/ui";
import {
  simulatorApi,
  type SimulatorCameraLens,
  type SimulatorDevicePlatform,
} from "@/api/ws/simulator-api";
import {
  parseSimulatorError,
  simulatorErrorText,
  type SimulatorChromeReason,
} from "../lib/simulator-errors";
import { pngFileIsAllowed, readPngBase64 } from "../lib/simulator-inventory";

export function SimulatorCameraControl({
  workspaceId,
  platform,
}: {
  workspaceId: string | null;
  platform: SimulatorDevicePlatform | null | undefined;
}) {
  const t = useTranslations("features.simulator");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [lens, setLens] = React.useState<SimulatorCameraLens>("front");
  const [busy, setBusy] = React.useState<"inject" | "clear" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorReason, setErrorReason] = React.useState<SimulatorChromeReason | null>(null);

  const show = platform === "android";

  const run = React.useCallback(
    async (kind: "inject" | "clear", fn: () => Promise<unknown>) => {
      if (!workspaceId) return;
      setBusy(kind);
      setError(null);
      setErrorReason(null);
      try {
        await fn();
      } catch (err) {
        setErrorReason(parseSimulatorError(err));
        setError(simulatorErrorText(err));
      } finally {
        setBusy(null);
      }
    },
    [workspaceId],
  );

  const onPick = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !workspaceId) return;
      if (!pngFileIsAllowed(file)) {
        setErrorReason(null);
        setError(t("cameraFileInvalid"));
        return;
      }
      try {
        const png_base64 = await readPngBase64(file);
        await run("inject", () =>
          simulatorApi.cameraInject(workspaceId, lens, { png_base64 }),
        );
      } catch (err) {
        setErrorReason(parseSimulatorError(err));
        setError(simulatorErrorText(err));
      }
    },
    [lens, run, t, workspaceId],
  );

  if (!show) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("camera")}</span>
        <ToggleGroup
          type="single"
          size="sm"
          value={lens}
          onValueChange={(next) => {
            if (next === "front" || next === "back") setLens(next);
          }}
          disabled={busy !== null}
          variant="outline"
        >
          <ToggleGroupItem value="front">{t("front")}</ToggleGroupItem>
          <ToggleGroupItem value="back">{t("back")}</ToggleGroupItem>
        </ToggleGroup>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,.png"
          className="hidden"
          onChange={(event) => {
            void onPick(event);
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="outline"
          loading={busy === "inject"}
          disabled={!workspaceId || busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {t("choosePng")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          loading={busy === "clear"}
          disabled={!workspaceId || busy !== null}
          onClick={() => {
            if (!workspaceId) return;
            void run("clear", () => simulatorApi.cameraClear(workspaceId, lens));
          }}
        >
          {t("actions.clear")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("cameraHelper")}</p>
      {errorReason || error ? (
        <p className="text-xs text-destructive">
          {errorReason ? t(`reasons.${errorReason}.body`) : error}
        </p>
      ) : null}
    </div>
  );
}
