"use client";

import { AlertTriangle, Check, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@workspace/ui/components/ui/button";

import type {
  Phase,
  ProbeResult,
} from "@/features/simulator/store/use-simulator-session-store";

type SetupAction =
  | "install_clt"
  | "open_xcode_platforms"
  | "open_xcode_download"
  | "create_default_iphone"
  | "take_over"
  | "check_update"
  | "reinstall";

type SimulatorSetupCardProps = {
  workspaceId: string;
  probe: ProbeResult | null;
  lastError: { code: string; message: string } | null;
  phase: Phase;
  onRecheck: () => void;
  onAction: (action: SetupAction) => void;
  showRecheck?: boolean;
};

function reasonKey(
  code: string | null,
  phase: Phase,
): string {
  if (code === "missing_iphone") return "missingHandset";
  if (code === "hosted_web" || code === "requires_desktop") return "requiresDesktop";
  if (code === "reconnecting_exhausted") return "reconnecting";
  if (code) return code;
  return phase === "reconnecting" ? "reconnecting" : "failed";
}

function actionFor(code: string | null): SetupAction | null {
  switch (code) {
    case "missing_simctl":
      return "open_xcode_download";
    case "missing_ios_runtime":
      return "open_xcode_platforms";
    case "missing_iphone":
      return "create_default_iphone";
    case "capture_xcode_mismatch":
      return "check_update";
    case "helper_missing":
      return "reinstall";
    case "simulator_in_use":
      return "take_over";
    default:
      return null;
  }
}

export function SimulatorSetupCard({
  workspaceId,
  probe,
  lastError,
  phase,
  onRecheck,
  onAction,
  showRecheck = true,
}: SimulatorSetupCardProps) {
  const t = useTranslations("simulator");
  const code = lastError?.code ?? probe?.code ?? null;
  const primaryAction = actionFor(code);
  const reason = reasonKey(code, phase);
  const facts = probe?.facts;
  const canRecheck =
    showRecheck && code !== "hosted_web" && code !== "requires_desktop";

  const actionLabel = (action: SetupAction): string =>
    action === "create_default_iphone"
      ? t("actions.createDefault")
      : t(`actions.${action}`);

  return (
    <section
      className="flex min-h-0 flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
      data-workspace-id={workspaceId}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2">
          <AlertTriangle className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h2 className="font-medium">{t("cards.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`cards.${reason}`, { message: lastError?.message ?? "" })}
          </p>
        </div>
      </div>

      {lastError?.message && code !== "hosted_web" && code !== "requires_desktop" ? (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {lastError.message}
        </p>
      ) : null}

      {facts ? (
        <dl className="grid gap-2 text-sm">
          {facts.macosVersion ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.macos")}</dt>
              <dd>{facts.macosVersion}</dd>
            </div>
          ) : null}
          {facts.arch ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.arch")}</dt>
              <dd>{facts.arch}</dd>
            </div>
          ) : null}
          {facts.xcodePath ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.xcodePath")}</dt>
              <dd className="max-w-[65%] truncate text-right">{facts.xcodePath}</dd>
            </div>
          ) : null}
          {facts.xcodeVersion ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.xcodeVersion")}</dt>
              <dd>{facts.xcodeVersion}</dd>
            </div>
          ) : null}
          {facts.helperVersion ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.helper")}</dt>
              <dd>{facts.helperVersion}</dd>
            </div>
          ) : null}
          {facts.runtimes.length > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.runtimes")}</dt>
              <dd className="text-right">{facts.runtimes.map((item) => item.name).join(", ")}</dd>
            </div>
          ) : null}
          {facts.simulators.length > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("facts.simulators")}</dt>
              <dd className="text-right">{facts.simulators.map((item) => item.name).join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {primaryAction ? (
          <Button size="sm" onClick={() => onAction(primaryAction)}>
            {primaryAction === "check_update" ? (
              <RotateCw className="mr-1.5 size-3.5" />
            ) : (
              <Check className="mr-1.5 size-3.5" />
            )}
            {actionLabel(primaryAction)}
          </Button>
        ) : null}
        {code === "missing_simctl" ? (
          <Button size="sm" variant="outline" onClick={() => onAction("install_clt")}>
            {actionLabel("install_clt")}
          </Button>
        ) : null}
        {canRecheck ? (
          <Button size="sm" variant="ghost" onClick={onRecheck}>
            <RotateCw className="mr-1.5 size-3.5" />
            {t("actions.recheck")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export type { SetupAction, SimulatorSetupCardProps };
