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
} from "@workspace/ui";
import {
  ArrowUpCircle,
  Cpu,
  Download,
  Loader2,
  Scan,
  Shield,
  Square,
  Trash2,
} from "lucide-react";
import { DesktopUsePermissionsPanel } from "@/features/settings/components/DesktopUsePermissionsPanel";
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
};

type DoctorLite = {
  engine_installed?: boolean;
  accessibility?: boolean | null;
  screen_recording?: boolean | null;
};

export function DesktopUseSettingsSection() {
  const t = useTranslations("settings.desktopUse");
  const [status, setStatus] = useState<DesktopUseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borderBusy, setBorderBusy] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);

  // Collapsible groups — defaults applied once after first status/doctor load.
  const [engineOpen, setEngineOpen] = useState(true);
  const [permissionsOpen, setPermissionsOpen] = useState(true);
  const [visibilityOpen, setVisibilityOpen] = useState(true);
  const defaultsAppliedRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
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
        if (!defaultsAppliedRef.current) {
          defaultsAppliedRef.current = true;
          // Not installed / not desktop → keep engine + permissions expanded.
          setEngineOpen(true);
          setPermissionsOpen(true);
        }
        return;
      }
      const res = await desktopInvoke<DesktopUseStatus>("desktop_use_status");
      setStatus(res);

      // One-shot default collapse: installed engine ready → collapse;
      // all permissions granted → collapse. User can always re-expand.
      if (!defaultsAppliedRef.current) {
        defaultsAppliedRef.current = true;
        const installed = Boolean(res?.driver?.installed);
        const updateAvailable = Boolean(res?.update_available);
        // Collapse when installed and no pending update (actions are secondary).
        setEngineOpen(!(installed && !updateAvailable));

        let allGranted = false;
        try {
          const doctor = await desktopInvoke<DoctorLite>("desktop_use_doctor");
          allGranted =
            Boolean(doctor?.engine_installed) &&
            doctor?.accessibility === true &&
            doctor?.screen_recording === true;
        } catch {
          allGranted = false;
        }
        setPermissionsOpen(!allGranted);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.statusFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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

  const run = async (
    actionKey: "install" | "update" | "stop" | "uninstall",
    fn: () => Promise<void>,
  ) => {
    setBusyAction(actionKey);
    setError(null);
    try {
      await fn();
      // Install / stop / uninstall change doctor results — drop readiness cache.
      invalidateDesktopUseReadinessCache();
      await load({ silent: true });
    } catch (e) {
      const fallback =
        actionKey === "install"
          ? t("errors.installFailed")
          : actionKey === "update"
            ? t("errors.updateFailed")
            : actionKey === "stop"
              ? t("errors.stopFailed")
              : t("errors.uninstallFailed");
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusyAction(null);
    }
  };

  const installed = Boolean(status?.driver?.installed);
  const updateAvailable = Boolean(status?.update_available);
  const installedVersion =
    status?.installed_version ?? status?.driver?.engine_version ?? null;
  const pinnedVersion = status?.pinned_version ?? null;
  const busy = busyAction !== null;
  const desktop = isDesktopRuntime();

  const engineStatusLabel = (() => {
    if (!desktop) return t("status.webOnly");
    if (!installed) return t("engine.notInstalled");
    if (updateAvailable) {
      const ver = installedVersion ? `v${installedVersion}` : "";
      return ver
        ? `${t("engine.updateAvailable")} · ${ver}`
        : t("engine.updateAvailable");
    }
    const ver = installedVersion ? `v${installedVersion}` : "";
    return ver ? `${t("engine.installed")} · ${ver}` : t("engine.installed");
  })();

  const engineGroupDescription = (() => {
    if (!desktop) return t("desktopOnly");
    if (!installed) return t("engine.installHint");
    if (updateAvailable) {
      return t("engine.updateHint", {
        current: installedVersion ?? "—",
        next: pinnedVersion ?? "—",
      });
    }
    return t("groups.engine.description");
  })();

  return (
    <div className="space-y-4">
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
          ) : !desktop ? (
            <span className="text-sm text-muted-foreground">
              {engineStatusLabel}
            </span>
          ) : !installed ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run("install", async () => {
                  await desktopInvoke("desktop_use_driver_ensure", {
                    force: false,
                  });
                })
              }
              className="cursor-pointer"
            >
              {busyAction === "install" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t("actions.install")}
            </Button>
          ) : updateAvailable ? (
            <div className="flex flex-col items-end gap-2">
              <span className="text-sm text-muted-foreground">
                {engineStatusLabel}
              </span>
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
          ) : (
            <span className="text-sm text-muted-foreground">
              {engineStatusLabel}
            </span>
          )}
        </SettingsGroupRow>

        {installed && desktop ? (
          <>
            <SettingsGroupRow
              title={t("actions.stop")}
              description={t("engine.stopHint")}
              wide
            >
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
            </SettingsGroupRow>

            <SettingsGroupRow
              title={t("actions.uninstall")}
              description={t("engine.removeHint")}
              wide
            >
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
            </SettingsGroupRow>
          </>
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
      >
        <DesktopUsePermissionsPanel />
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
              disabled={borderBusy}
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
