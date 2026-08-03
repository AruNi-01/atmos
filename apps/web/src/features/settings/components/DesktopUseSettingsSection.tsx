"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui/components/ui/button";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import { Download, Loader2, Square, Trash2, RefreshCw, MousePointer2 } from "lucide-react";
import { Switch } from "@workspace/ui/components/ui/switch";
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
  const [pointerEnabled, setPointerEnabled] = useState(true);
  const [pointerBusy, setPointerBusy] = useState(false);

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
      try {
        const ptr = await desktopInvoke<{ enabled: boolean }>(
          "desktop_use_pointer_status",
        );
        setPointerEnabled(ptr?.enabled !== false);
      } catch {
        /* pointer optional on older shells */
      }
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

  const togglePointer = async (enabled: boolean) => {
    setPointerEnabled(enabled);
    if (!isDesktopRuntime()) return;
    try {
      await desktopInvoke("desktop_use_pointer_set_enabled", { enabled });
      if (!enabled) {
        await desktopInvoke("desktop_use_pointer_hide");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.pointerFailed"));
    }
  };

  const previewPointer = async () => {
    if (!isDesktopRuntime()) return;
    setPointerBusy(true);
    setError(null);
    try {
      // Demo path across primary display: show → move → click → type chip → hide
      await desktopInvoke("desktop_use_pointer_play", {
        kind: "show",
        x: 220,
        y: 180,
      });
      await desktopInvoke("desktop_use_pointer_play", {
        kind: "move",
        x: 520,
        y: 320,
      });
      await desktopInvoke("desktop_use_pointer_play", {
        kind: "click",
        x: 520,
        y: 320,
      });
      await desktopInvoke("desktop_use_pointer_play", {
        kind: "type",
        x: 520,
        y: 320,
        text: t("pointer.previewTypeSample"),
      });
      window.setTimeout(() => {
        void desktopInvoke("desktop_use_pointer_hide");
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.pointerFailed"));
    } finally {
      setPointerBusy(false);
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

      <section className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <MousePointer2 className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">{t("pointer.title")}</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("pointer.hint")}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-xs text-muted-foreground">
              {pointerEnabled ? t("pointer.on") : t("pointer.off")}
            </span>
            <Switch
              checked={pointerEnabled}
              disabled={!isDesktopRuntime() || loading}
              onCheckedChange={(v) => void togglePointer(v)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !isDesktopRuntime() || loading || pointerBusy || !pointerEnabled
            }
            onClick={() => void previewPointer()}
            className="cursor-pointer"
          >
            {pointerBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MousePointer2 className="size-4" />
            )}
            {t("pointer.preview")}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <AppshotPermissionsPanel embedded />
      </section>
    </div>
  );
}
