"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui/components/ui/button";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import { Switch } from "@workspace/ui/components/ui/switch";
import {
  ArrowUpCircle,
  Download,
  Loader2,
  Square,
  Trash2,
} from "lucide-react";
import { DesktopUsePermissionsPanel } from "@/features/settings/components/DesktopUsePermissionsPanel";
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

/** Same row chrome as Canvas / Terminal settings cards. */
function SettingsItemCard({
  title,
  description,
  children,
  wide = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div
        className={
          wide
            ? "grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5"
            : "grid grid-cols-[minmax(0,1fr)_100px] gap-8 px-6 py-5"
        }
      >
        <div>
          <p className="text-base font-medium text-foreground">{title}</p>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end">{children}</div>
      </div>
    </div>
  );
}

export function DesktopUseSettingsSection() {
  const t = useTranslations("settings.desktopUse");
  const [status, setStatus] = useState<DesktopUseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borderBusy, setBorderBusy] = useState(false);

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
        return;
      }
      const res = await desktopInvoke<DesktopUseStatus>("desktop_use_status");
      setStatus(res);
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

  return (
    <div className="space-y-4">
      {/* Control engine */}
      <SettingsItemCard
        title={t("engine.title")}
        description={
          !desktop
            ? t("desktopOnly")
            : !installed
              ? t("engine.installHint")
              : updateAvailable
                ? t("engine.updateHint", {
                    current: installedVersion ?? "—",
                    next: pinnedVersion ?? "—",
                  })
                : t("engine.hint")
        }
      >
        {loading ? (
          <Skeleton className="h-9 w-36" />
        ) : !desktop ? (
          <span className="text-sm text-muted-foreground">{engineStatusLabel}</span>
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
          <span className="text-sm text-muted-foreground">{engineStatusLabel}</span>
        )}
      </SettingsItemCard>

      {/* Stop — always visible when installed */}
      {installed && desktop ? (
        <SettingsItemCard
          title={t("actions.stop")}
          description={t("engine.stopHint")}
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
        </SettingsItemCard>
      ) : null}

      {/* Remove — always visible when installed */}
      {installed && desktop ? (
        <SettingsItemCard
          title={t("actions.uninstall")}
          description={t("engine.removeHint")}
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || loading}
            onClick={() =>
              void run("uninstall", async () => {
                await desktopInvoke("desktop_use_driver_uninstall");
              })
            }
            className="cursor-pointer text-destructive hover:text-destructive"
          >
            {busyAction === "uninstall" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t("actions.uninstall")}
          </Button>
        </SettingsItemCard>
      ) : null}

      {/* Operation border chrome */}
      <SettingsItemCard
        title={t("border.title")}
        description={t("border.description")}
        wide={false}
      >
        {loading ? (
          <Skeleton className="h-6 w-10" />
        ) : !desktop ? (
          <span className="text-sm text-muted-foreground">{t("status.webOnly")}</span>
        ) : (
          <Switch
            checked={operationBorderEnabled}
            disabled={borderBusy}
            onCheckedChange={(checked) => void setOperationBorder(!!checked)}
            aria-label={t("border.title")}
          />
        )}
      </SettingsItemCard>

      {/* Permissions card — same outer chrome */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="border-b border-border px-6 py-5">
          <p className="text-base font-medium text-foreground">
            {t("permissions.title")}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("permissions.unifiedHint")}
          </p>
        </div>
        <div className="px-4 py-1">
          <DesktopUsePermissionsPanel />
        </div>
      </div>

      {(error || status?.driver?.error) && (
        <p className="px-1 text-sm text-destructive">
          {error || status?.driver?.error}
        </p>
      )}
    </div>
  );
}
