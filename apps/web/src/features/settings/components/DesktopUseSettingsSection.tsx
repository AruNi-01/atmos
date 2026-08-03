"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui/components/ui/button";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import { Download, Loader2, Square, Trash2, RefreshCw } from "lucide-react";
import { AppshotPermissionsPanel } from "@/features/appshot/components/AppshotPermissionsPanel";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";

type DriverStatus = {
  phase: string;
  installed: boolean;
  progress?: number | null;
  error?: string | null;
  engine_path?: string | null;
};

type DesktopUseStatus = {
  product: string;
  data_dir: string;
  capture: { available: boolean; platform: string; reason?: string | null };
  driver: DriverStatus;
};

export function DesktopUseSettingsSection() {
  const t = useTranslations("settings.desktopUse");
  const [status, setStatus] = useState<DesktopUseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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

  useEffect(() => {
    void load();
  }, [load]);

  const ensure = async () => {
    setBusy(true);
    setError(null);
    try {
      await desktopInvoke("desktop_use_driver_ensure", { force: false });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.ensureFailed"));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await desktopInvoke("desktop_use_driver_stop");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.stopFailed"));
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async () => {
    setBusy(true);
    try {
      await desktopInvoke("desktop_use_driver_uninstall");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.uninstallFailed"));
    } finally {
      setBusy(false);
    }
  };

  const driver = status?.driver;
  const capture = status?.capture;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("engine.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("engine.hint")}</p>
          </div>
          {loading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <Badge variant="outline" className="font-normal">
              {driver?.installed
                ? t("engine.installed")
                : t("engine.notInstalled")}
              {driver?.phase ? ` · ${driver.phase}` : ""}
            </Badge>
          )}
        </div>

        {capture ? (
          <p className="text-xs text-muted-foreground">
            {t("capture.label")}:{" "}
            {capture.available ? t("capture.available") : t("capture.unavailable")}
            {capture.reason ? ` — ${capture.reason}` : ""}
          </p>
        ) : null}

        {driver?.error ? (
          <p className="text-xs text-destructive">{driver.error}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={busy || loading || !isDesktopRuntime()}
            onClick={() => void ensure()}
            className="cursor-pointer"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {t("actions.ensure")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || loading || !driver?.installed}
            onClick={() => void stop()}
            className="cursor-pointer"
          >
            <Square className="size-4" />
            {t("actions.stop")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || loading || !driver?.installed}
            onClick={() => void uninstall()}
            className="cursor-pointer"
          >
            <Trash2 className="size-4" />
            {t("actions.uninstall")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || loading}
            onClick={() => void load()}
            className="cursor-pointer"
          >
            <RefreshCw className="size-4" />
            {t("actions.refresh")}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <AppshotPermissionsPanel embedded />
      </section>
    </div>
  );
}
