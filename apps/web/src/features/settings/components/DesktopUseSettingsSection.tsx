"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Switch,
  toastManager,
} from "@workspace/ui";
import {
  ArrowUpCircle,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  Scan,
  Shield,
  Square,
  Stethoscope,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { systemApi } from "@/api/rest-api";
import { DesktopUsePermissionsPanel } from "@/features/settings/components/DesktopUsePermissionsPanel";
// systemApi used only for install/update of the canonical CLI (not for version gate).
import { DesktopUseEngineProgressBar } from "@/features/settings/components/DesktopUseEngineProgressBar";
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from "@/features/settings/components/settings/SettingsGroupCard";
import { invalidateDesktopUseReadinessCache } from "@/features/desktop-use/lib/readiness";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";

type DriverStatus = {
  phase: string;
  installed: boolean;
  progress?: number | null;
  error?: string | null;
  engine_path?: string | null;
  engine_version?: string | null;
};

type DesktopUsePrefs = {
  operation_border_enabled: boolean;
  highlight_idle_ms: number;
};

type DesktopUseCliStatus = {
  installed: boolean;
  path?: string;
  version?: string | null;
  code?: string;
  min_cli_version?: string | null;
  meets_requirement?: boolean;
  /** Below this Desktop package's min_cli_version — not "channel has newer CLI". */
  update_required?: boolean;
};

type DesktopUseStatus = {
  product: string;
  data_dir: string;
  capture: { available: boolean; platform: string; reason?: string | null };
  driver: DriverStatus;
  host_app_name?: string | null;
  host_app_path?: string | null;
  pinned_version?: string | null;
  installed_version?: string | null;
  update_available?: boolean;
  prefs?: DesktopUsePrefs;
  cli?: DesktopUseCliStatus;
};

type CliGate = {
  installed: boolean;
  version: string | null;
  /** Package min CLI version (this Desktop build). */
  minVersion: string | null;
  /** True only when installed but below package min — not R2 latest. */
  updateRequired: boolean;
  meetsRequirement: boolean;
  path: string | null;
};

type DoctorLite = {
  engine_installed?: boolean;
  engine_ready?: boolean;
  accessibility?: boolean | null;
  screen_recording?: boolean | null;
  notes?: string[];
};

type RuntimeCheckResult = {
  ok?: boolean;
  healthy?: boolean;
  check?: {
    installed?: boolean;
    phase?: string;
    daemon_running?: boolean;
    daemon_responding?: boolean;
    healthy?: boolean;
    accessibility?: boolean | null;
    screen_recording?: boolean | null;
    engine_version?: string | null;
  };
};

export function DesktopUseSettingsSection() {
  const t = useTranslations("settings.desktopUse");
  const [status, setStatus] = useState<DesktopUseStatus | null>(null);
  const [cliGate, setCliGate] = useState<CliGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borderBusy, setBorderBusy] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);
  /** Live runtime label from last doctor probe / check. */
  const [runtimeLabel, setRuntimeLabel] = useState<string | null>(null);
  /**
   * Stop → Restart only after an explicit Check finds the daemon unhealthy,
   * or after the user stops the engine.
   */
  const [restartSuggested, setRestartSuggested] = useState(false);

  // Collapsible groups — defaults applied once after first status/doctor load.
  const [engineOpen, setEngineOpen] = useState(true);
  const [permissionsOpen, setPermissionsOpen] = useState(true);
  const [visibilityOpen, setVisibilityOpen] = useState(true);
  const defaultsAppliedRef = useRef(false);
  /** Refresh control published by DesktopUsePermissionsPanel → group header. */
  const [permissionsHeaderEnd, setPermissionsHeaderEnd] =
    useState<React.ReactNode>(null);
  /**
   * Bumped after install/update/stop/uninstall so the permissions panel re-runs
   * doctor without requiring collapse/expand (Collapsible keeps children mounted).
   */
  const [permissionsRefreshToken, setPermissionsRefreshToken] = useState(0);

  const applyRuntimeCheck = useCallback(
    (check: RuntimeCheckResult["check"] | null | undefined) => {
      if (!check) {
        setRuntimeLabel(null);
        return false;
      }
      if (!check.installed) {
        setRuntimeLabel(t("engine.notInstalled"));
        return false;
      }
      if (check.phase === "stopped") {
        setRuntimeLabel(t("engine.runtime.stopped"));
        return false;
      }
      if (check.healthy || check.daemon_responding) {
        setRuntimeLabel(t("engine.runtime.running"));
        return true;
      }
      if (check.daemon_running) {
        setRuntimeLabel(t("engine.runtime.notResponding"));
        return false;
      }
      setRuntimeLabel(t("engine.runtime.notRunning"));
      return false;
    },
    [t],
  );

  const applyDoctorRuntime = useCallback(
    (doctor: DoctorLite | null | undefined) => {
      if (!doctor) {
        setRuntimeLabel(null);
        return false;
      }
      const ready = Boolean(doctor.engine_ready);
      if (ready) {
        setRuntimeLabel(t("engine.runtime.running"));
      } else if (doctor.engine_installed) {
        setRuntimeLabel(t("engine.runtime.notRunning"));
      } else {
        setRuntimeLabel(t("engine.notInstalled"));
      }
      return ready;
    },
    [t],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; probeRuntime?: boolean }) => {
      const silent = Boolean(opts?.silent);
      const probeRuntime = opts?.probeRuntime !== false;
      if (!silent) setLoading(true);
      setError(null);
      try {
        if (!isDesktopRuntime()) {
          setStatus({
            product: "Desktop Use",
            data_dir: "",
            capture: {
              available: false,
              platform: "web",
              reason: t("desktopOnly"),
            },
            driver: { phase: "not_installed", installed: false },
            update_available: false,
            prefs: {
              operation_border_enabled: true,
              highlight_idle_ms: 8000,
            },
          });
          setCliGate(null);
          setRuntimeLabel(null);
          setRestartSuggested(false);
          if (!defaultsAppliedRef.current) {
            defaultsAppliedRef.current = true;
            // Not installed / not desktop → keep engine + permissions expanded.
            setEngineOpen(true);
            setPermissionsOpen(true);
          }
          return;
        }

        // CLI gate: package min_cli_version only (not global release-channel latest).
        // About still uses /api/system/cli-version-check for optional channel updates.
        let nextCli: CliGate = {
          installed: false,
          version: null,
          minVersion: null,
          updateRequired: false,
          meetsRequirement: false,
          path: null,
        };
        try {
          const probe = await desktopInvoke<DesktopUseCliStatus>("atmos_cli_probe");
          nextCli = {
            installed: Boolean(probe?.installed),
            version: probe?.version ?? null,
            minVersion: probe?.min_cli_version ?? null,
            updateRequired: Boolean(probe?.update_required),
            meetsRequirement: Boolean(probe?.meets_requirement),
            path: probe?.path ?? null,
          };
        } catch {
          /* leave default not-installed */
        }
        setCliGate(nextCli);

        const res = await desktopInvoke<DesktopUseStatus>("desktop_use_status");
        setStatus(res);
        if (res?.cli) {
          setCliGate({
            installed: Boolean(res.cli.installed),
            version: res.cli.version ?? null,
            minVersion: res.cli.min_cli_version ?? nextCli.minVersion,
            updateRequired: Boolean(res.cli.update_required),
            meetsRequirement: Boolean(res.cli.meets_requirement),
            path: res.cli.path ?? nextCli.path,
          });
        }

        // One-shot default collapse: installed engine ready → collapse;
        // all permissions granted → collapse. User can always re-expand.
        if (!defaultsAppliedRef.current) {
          defaultsAppliedRef.current = true;
          const cliReady = Boolean(
            (res?.cli?.meets_requirement ?? nextCli.meetsRequirement) ||
              (nextCli.installed && !nextCli.updateRequired && nextCli.meetsRequirement),
          );
          const installed = Boolean(res?.driver?.installed);
          const engineUpdateAvailable = Boolean(res?.update_available);
          // Collapse engine when ready and no engine update.
          setEngineOpen(cliReady ? !(installed && !engineUpdateAvailable) : false);

          let allGranted = false;
          if (cliReady) {
            try {
              const doctor = await desktopInvoke<DoctorLite>("desktop_use_doctor");
              allGranted =
                Boolean(doctor?.engine_installed) &&
                doctor?.accessibility === true &&
                doctor?.screen_recording === true;
              applyDoctorRuntime(doctor);
            } catch {
              allGranted = false;
            }
          }
          setPermissionsOpen(!allGranted);
        } else if (probeRuntime && res?.driver?.installed) {
          // Soft runtime label from phase when we skip doctor (e.g. progress poll).
          const phase = res.driver.phase;
          if (phase === "stopped") {
            setRuntimeLabel(t("engine.runtime.stopped"));
          } else if (phase === "downloading") {
            setRuntimeLabel(t("engine.runtime.downloading"));
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.statusFailed"));
      } finally {
        setLoading(false);
      }
    },
    [applyDoctorRuntime, t],
  );

  const installOrUpdateCli = async (isUpdate: boolean) => {
    setBusyAction(isUpdate ? "cli_update" : "cli_install");
    setError(null);
    try {
      await systemApi.installCli(true);
      invalidateDesktopUseReadinessCache();
      await load({ silent: true });
      setPermissionsRefreshToken((n) => n + 1);
      setEngineOpen(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isUpdate
            ? t("errors.cliUpdateFailed")
            : t("errors.cliInstallFailed"),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const operationBorderEnabled =
    status?.prefs?.operation_border_enabled ?? true;

  const setOperationBorder = async (enabled: boolean) => {
    if (!isDesktopRuntime() || borderBusy) return;
    setBorderBusy(true);
    setError(null);
    // Optimistic UI
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            prefs: {
              operation_border_enabled: enabled,
              highlight_idle_ms: prev.prefs?.highlight_idle_ms ?? 8000,
            },
          }
        : prev,
    );
    try {
      const res = await desktopInvoke<{
        ok: boolean;
        prefs: DesktopUsePrefs;
      }>("desktop_use_prefs_set", { operationBorder: enabled });
      if (res?.prefs) {
        setStatus((prev) => (prev ? { ...prev, prefs: res.prefs } : prev));
      }
      // Turning off: clear any live border immediately
      if (!enabled) {
        try {
          await desktopInvoke("desktop_use_drive_session_end");
        } catch {
          /* best-effort */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.prefsFailed"));
      await load({ silent: true });
    } finally {
      setBorderBusy(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Poll status while ensure is running so download % updates in the UI.
  useEffect(() => {
    if (busyAction !== "install" && busyAction !== "update") return;
    const id = setInterval(() => {
      void load({ silent: true, probeRuntime: false });
    }, 500);
    return () => clearInterval(id);
  }, [busyAction, load]);

  const run = async (
    actionKey: "install" | "update" | "stop" | "restart" | "uninstall",
    fn: () => Promise<void>,
  ) => {
    setBusyAction(actionKey);
    setError(null);
    try {
      await fn();
      // Install / stop / uninstall change doctor results — drop readiness cache.
      invalidateDesktopUseReadinessCache();
      await load({ silent: true });
      // Permissions panel does not share status IPC — poke it to re-doctor.
      setPermissionsRefreshToken((n) => n + 1);
      // After install/update/uninstall, surface the permissions group so Grant
      // rows are visible without the user re-expanding the card.
      if (
        actionKey === "install" ||
        actionKey === "update" ||
        actionKey === "uninstall"
      ) {
        setPermissionsOpen(true);
      }
      if (actionKey === "uninstall") {
        setEngineOpen(true);
        setRuntimeLabel(null);
        setRestartSuggested(false);
      }
      if (actionKey === "stop") {
        setRuntimeLabel(t("engine.runtime.stopped"));
        setRestartSuggested(true);
      }
      if (actionKey === "restart" || actionKey === "install" || actionKey === "update") {
        // Probe live daemon after start/restart (no auto-start).
        try {
          const res = await desktopInvoke<RuntimeCheckResult>(
            "desktop_use_driver_check",
          );
          const ready = applyRuntimeCheck(res?.check);
          setRestartSuggested(!ready);
        } catch {
          if (actionKey === "restart") setRestartSuggested(true);
        }
      }
    } catch (e) {
      const fallback =
        actionKey === "install"
          ? t("errors.installFailed")
          : actionKey === "update"
            ? t("errors.updateFailed")
            : actionKey === "stop"
              ? t("errors.stopFailed")
              : actionKey === "restart"
                ? t("errors.restartFailed")
                : t("errors.uninstallFailed");
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusyAction(null);
    }
  };

  const checkRuntime = async () => {
    if (!isDesktopRuntime() || busyAction) return;
    setBusyAction("check");
    setError(null);
    try {
      // Pure probe — never starts the daemon (unlike doctor).
      const res = await desktopInvoke<RuntimeCheckResult>(
        "desktop_use_driver_check",
      );
      const check = res?.check;
      const ready = applyRuntimeCheck(check);
      invalidateDesktopUseReadinessCache();

      const ax = check?.accessibility;
      const screen = check?.screen_recording;
      const issues: string[] = [];
      if (!ready) {
        if (check?.daemon_running && !check?.daemon_responding) {
          issues.push(t("engine.check.issues.notResponding"));
        } else {
          issues.push(t("engine.check.issues.notRunning"));
        }
      }
      if (ax === false) issues.push(t("engine.check.issues.accessibility"));
      if (screen === false) issues.push(t("engine.check.issues.screenRecording"));

      // Only daemon-not-ready flips Stop → Restart (permission issues stay as Stop).
      setRestartSuggested(!ready);

      if (issues.length === 0) {
        toastManager.add({
          title: t("engine.check.okTitle"),
          description: t("engine.check.okDescription"),
          type: "success",
        });
      } else {
        toastManager.add({
          title: t("engine.check.issueTitle"),
          description: issues.join(" · "),
          type: "error",
        });
      }
    } catch (e) {
      setRuntimeLabel(t("engine.runtime.unknown"));
      setRestartSuggested(true);
      toastManager.add({
        title: t("engine.check.failedTitle"),
        description:
          e instanceof Error ? e.message : t("errors.checkFailed"),
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const cliInstalled = Boolean(cliGate?.installed);
  const cliUpdateRequired = Boolean(cliGate?.updateRequired);
  const cliReady = Boolean(cliGate?.meetsRequirement);
  const installed = Boolean(status?.driver?.installed);
  const updateAvailable = Boolean(status?.update_available);
  const installedVersion =
    status?.installed_version ?? status?.driver?.engine_version ?? null;
  const pinnedVersion = status?.pinned_version ?? null;
  const busy = busyAction !== null;
  const desktop = isDesktopRuntime();
  const phase = status?.driver?.phase ?? "";
  const isDownloading =
    busyAction === "install" ||
    busyAction === "update" ||
    phase === "downloading";
  const rawProgress = status?.driver?.progress;
  const progressPct =
    typeof rawProgress === "number" && Number.isFinite(rawProgress)
      ? Math.round(Math.min(1, Math.max(0, rawProgress)) * 100)
      : isDownloading
        ? 0
        : null;
  const needsRestart = restartSuggested;
  /** Engine actions require a CLI that meets this package's min version. */
  const engineActionsEnabled = desktop && cliReady;

  /** Install/update UI only when CLI is missing or below package min. */
  const showCliGateBanner = desktop && !loading && !cliReady;

  const engineStatusLabel = (() => {
    if (!desktop) return t("status.webOnly");
    if (!cliInstalled) return t("cli.notInstalled");
    if (cliUpdateRequired) return t("cli.updateRequired");
    if (!installed) {
      if (isDownloading && progressPct !== null) {
        return t("engine.downloadingPct", { progress: progressPct });
      }
      return t("engine.notInstalled");
    }
    if (updateAvailable) {
      const ver = installedVersion ? `v${installedVersion}` : "";
      return ver
        ? `${t("engine.updateAvailable")} · ${ver}`
        : t("engine.updateAvailable");
    }
    const ver = installedVersion ? `v${installedVersion}` : "";
    return ver ? `${t("engine.installed")} · ${ver}` : t("engine.installed");
  })();

  const runtimeStatusDisplay =
    runtimeLabel ??
    (phase === "stopped"
      ? t("engine.runtime.stopped")
      : installed
        ? t("engine.runtime.ready")
        : t("engine.notInstalled"));

  const engineGroupDescription = (() => {
    if (!desktop) return t("desktopOnly");
    if (!cliInstalled) return t("cli.installHint");
    if (cliUpdateRequired) {
      return t("cli.updateHint", {
        current: cliGate?.version ?? "—",
        min: cliGate?.minVersion ?? "—",
      });
    }
    if (!installed) return t("engine.installHint");
    if (updateAvailable) {
      return t("engine.updateHint", {
        current: installedVersion ?? "—",
        next: pinnedVersion ?? "—",
      });
    }
    return t("groups.engine.description");
  })();

  const uninstallButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy || loading}
      onClick={() => setUninstallOpen(true)}
      className="cursor-pointer text-destructive hover:text-destructive"
    >
      {busyAction === "uninstall" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      {t("actions.uninstall")}
    </Button>
  );

  const downloadProgressAside =
    isDownloading && progressPct !== null ? (
      <div className="flex items-center gap-2">
        <DesktopUseEngineProgressBar value={progressPct} />
        <span className="min-w-9 text-right text-xs tabular-nums text-muted-foreground">
          {progressPct}%
        </span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {/* CLI gate — only when missing or below package min (hidden when OK). */}
      {showCliGateBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {!cliInstalled ? t("cli.notInstalled") : t("cli.updateRequired")}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {!cliInstalled
                  ? t("cli.installHint")
                  : t("cli.updateHint", {
                      current: cliGate?.version ?? "—",
                      min: cliGate?.minVersion ?? "—",
                    })}
              </p>
            </div>
          </div>
          {!cliInstalled ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void installOrUpdateCli(false)}
              className="cursor-pointer shrink-0"
            >
              {busyAction === "cli_install" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t("cli.install")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void installOrUpdateCli(true)}
              className="cursor-pointer shrink-0"
            >
              {busyAction === "cli_update" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="size-4" />
              )}
              {t("cli.update")}
            </Button>
          )}
        </div>
      ) : null}

      {/* 1. Control engine — install / status / stop / uninstall */}
      <SettingsGroupCard
        open={engineOpen}
        onOpenChange={setEngineOpen}
        icon={Cpu}
        title={t("groups.engine.title")}
        description={engineGroupDescription}
      >
        <SettingsGroupRow
          title={t("engine.statusTitle")}
          description={t("engine.statusDescription")}
          wide
        >
          {loading ? (
            <Skeleton className="h-9 w-36" />
          ) : !desktop || !cliReady ? (
            <span className="text-sm text-muted-foreground">
              {engineStatusLabel}
            </span>
          ) : !installed || isDownloading ? (
            <div className="flex items-center gap-3">
              {downloadProgressAside}
              <Button
                type="button"
                size="sm"
                disabled={busy || !engineActionsEnabled}
                onClick={() =>
                  void run(installed ? "update" : "install", async () => {
                    await desktopInvoke("desktop_use_driver_ensure", {
                      force: installed,
                    });
                  })
                }
                className="cursor-pointer"
              >
                {busyAction === "install" || busyAction === "update" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : installed ? (
                  <ArrowUpCircle className="size-4" />
                ) : (
                  <Download className="size-4" />
                )}
                {installed ? t("actions.update") : t("actions.install")}
              </Button>
            </div>
          ) : updateAvailable ? (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {uninstallButton}
                <span className="text-sm text-muted-foreground">
                  {engineStatusLabel}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {downloadProgressAside}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run("update", async () => {
                      await desktopInvoke("desktop_use_driver_ensure", {
                        force: true,
                      });
                    })
                  }
                  className="cursor-pointer"
                >
                  {busyAction === "update" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="size-4" />
                  )}
                  {t("actions.update")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {uninstallButton}
              <span className="text-sm text-muted-foreground">
                {engineStatusLabel}
              </span>
            </div>
          )}
        </SettingsGroupRow>

        {installed && desktop && cliReady && !isDownloading ? (
          <SettingsGroupRow
            title={t("engine.runtimeTitle")}
            description={t("engine.runtimeDescription")}
            wide
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                className={
                  restartSuggested
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {runtimeStatusDisplay}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || loading}
                onClick={() => void checkRuntime()}
                className="cursor-pointer"
              >
                {busyAction === "check" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Stethoscope className="size-4" />
                )}
                {t("actions.check")}
              </Button>
              {needsRestart ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() =>
                    void run("restart", async () => {
                      const res = await desktopInvoke<{
                        ok?: boolean;
                        error?: string;
                      }>("desktop_use_driver_restart");
                      if (res && res.ok === false) {
                        throw new Error(
                          res.error || t("errors.restartFailed"),
                        );
                      }
                    })
                  }
                  className="cursor-pointer"
                >
                  {busyAction === "restart" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {t("actions.restart")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() =>
                    void run("stop", async () => {
                      await desktopInvoke("desktop_use_driver_stop");
                    })
                  }
                  className="cursor-pointer"
                >
                  {busyAction === "stop" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Square className="size-4" />
                  )}
                  {t("actions.stop")}
                </Button>
              )}
            </div>
          </SettingsGroupRow>
        ) : null}
      </SettingsGroupCard>

      <Dialog
        open={uninstallOpen}
        onOpenChange={(open) => {
          if (busyAction === "uninstall") return;
          setUninstallOpen(open);
        }}
      >
        <DialogContent showCloseButton={busyAction !== "uninstall"}>
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="size-5 text-destructive" />
            </div>
            <DialogTitle>{t("uninstallConfirm.title")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-pretty text-sm text-muted-foreground">
                <p>{t("uninstallConfirm.description")}</p>
                <div>
                  <p className="font-medium text-foreground">
                    {t("uninstallConfirm.consequencesTitle")}
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    <li>{t("uninstallConfirm.consequences.appshotHost")}</li>
                    <li>{t("uninstallConfirm.consequences.agentControl")}</li>
                    <li>{t("uninstallConfirm.consequences.cli")}</li>
                    <li>{t("uninstallConfirm.consequences.chrome")}</li>
                  </ul>
                </div>
                <p className="text-xs leading-5">{t("uninstallConfirm.note")}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busyAction === "uninstall"}
              onClick={() => setUninstallOpen(false)}
              className="cursor-pointer"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyAction === "uninstall"}
              onClick={() =>
                void run("uninstall", async () => {
                  await desktopInvoke("desktop_use_driver_uninstall");
                  setUninstallOpen(false);
                })
              }
              className="cursor-pointer"
            >
              {busyAction === "uninstall" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t("uninstallConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Permissions — collapse by default when all granted */}
      <SettingsGroupCard
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        icon={Shield}
        title={t("groups.permissions.title")}
        description={t("groups.permissions.description")}
        headerEnd={permissionsHeaderEnd}
      >
        <DesktopUsePermissionsPanel
          onHeaderEndChange={setPermissionsHeaderEnd}
          engineInstalledFromParent={
            desktop && cliReady ? installed : desktop ? false : null
          }
          doctorRefreshToken={permissionsRefreshToken}
        />
      </SettingsGroupCard>

      {/* 3. Visual feedback — operation border (+ future under-cursor cues) */}
      <SettingsGroupCard
        open={visibilityOpen}
        onOpenChange={setVisibilityOpen}
        icon={Scan}
        title={t("groups.visibility.title")}
        description={t("groups.visibility.description")}
      >
        <SettingsGroupRow
          title={t("border.title")}
          description={t("border.description")}
        >
          {loading ? (
            <Skeleton className="h-6 w-10" />
          ) : !desktop ? (
            <span className="text-sm text-muted-foreground">
              {t("status.webOnly")}
            </span>
          ) : (
            <Switch
              checked={operationBorderEnabled}
              disabled={borderBusy || !cliReady}
              onCheckedChange={(checked) => void setOperationBorder(!!checked)}
              aria-label={t("border.title")}
            />
          )}
        </SettingsGroupRow>
      </SettingsGroupCard>

      {(error || status?.driver?.error) && (
        <p className="px-1 text-sm text-destructive">
          {error || status?.driver?.error}
        </p>
      )}
    </div>
  );
}
