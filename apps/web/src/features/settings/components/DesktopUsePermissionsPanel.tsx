"use client";

/**
 * Desktop Use OS permissions — row layout aligned with SettingsGroupRow.
 */

import React from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import {
  Accessibility,
  Check,
  Loader2,
  MonitorPlay,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { invalidateDesktopUseReadinessCache } from "@/features/desktop-use/lib/readiness";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";

type PermissionName = "accessibility" | "screen_recording";

type DoctorStatus = {
  host_app_name?: string;
  engine_installed?: boolean;
  engine_ready?: boolean;
  accessibility?: boolean | null;
  screen_recording?: boolean | null;
  notes?: string[];
};

const ORDER: PermissionName[] = ["accessibility", "screen_recording"];

/** Match System Settings privacy icons (Accessibility figure / Screen Recording). */
const PERMISSION_ICONS: Record<PermissionName, LucideIcon> = {
  accessibility: Accessibility,
  screen_recording: MonitorPlay,
};

export type DesktopUsePermissionsPanelProps = {
  className?: string;
};

export function DesktopUsePermissionsPanel({
  className,
}: DesktopUsePermissionsPanelProps) {
  const t = useTranslations("settings.desktopUse");
  const [doctor, setDoctor] = React.useState<DoctorStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [manualRefreshing, setManualRefreshing] = React.useState(false);
  const [grantingTarget, setGrantingTarget] = React.useState<PermissionName | null>(
    null,
  );
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = React.useRef(true);

  const stopPoll = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = React.useCallback(
    async (mode: "initial" | "silent" | "manual" = "silent") => {
      if (mode === "initial") setInitialLoading(true);
      else if (mode === "manual") setManualRefreshing(true);
      if (mode !== "silent") setError(null);
      try {
        if (!isDesktopRuntime()) {
          if (mountedRef.current) setDoctor(null);
          return;
        }
        const d = await desktopInvoke<DoctorStatus>("desktop_use_doctor");
        if (mountedRef.current) setDoctor(d);
        // Accessibility granted → dismiss drag panel if still open.
        if (d?.accessibility === true) {
          try {
            await desktopInvoke("desktop_use_close_grant_overlay");
          } catch {
            /* overlay optional */
          }
        }
      } catch (e) {
        if (mountedRef.current) {
          if (mode !== "silent") {
            setError(e instanceof Error ? e.message : t("errors.statusFailed"));
          }
          if (mode === "initial") setDoctor(null);
        }
      } finally {
        if (mountedRef.current) {
          setInitialLoading(false);
          if (mode === "manual") setManualRefreshing(false);
        }
      }
    },
    [t],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    void refresh("initial");
    return () => {
      mountedRef.current = false;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const engineInstalled = Boolean(doctor?.engine_installed);
  const busy = manualRefreshing || grantingTarget !== null;

  const openGrant = async (target: PermissionName) => {
    if (!isDesktopRuntime() || !engineInstalled) return;
    setGrantingTarget(target);
    setError(null);
    try {
      const locale =
        typeof navigator !== "undefined" ? navigator.language : undefined;
      await desktopInvoke("desktop_use_grant_permissions", { target, locale });
      invalidateDesktopUseReadinessCache();
      stopPoll();
      const started = Date.now();
      pollRef.current = setInterval(() => {
        if (Date.now() - started > 120_000) {
          stopPoll();
          return;
        }
        void refresh("silent");
      }, 2000);
      await refresh("silent");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.grantFailed"));
    } finally {
      setGrantingTarget(null);
    }
  };

  if (!isDesktopRuntime()) {
    return (
      <p className={cn("px-2 py-4 text-sm text-muted-foreground", className)}>
        {t("desktopOnly")}
      </p>
    );
  }

  if (initialLoading && !doctor) {
    return (
      <div className={cn("space-y-0 px-2 py-2", className)}>
        <div className="h-16 animate-pulse rounded-lg bg-muted/40" />
        <div className="mt-2 h-16 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (!engineInstalled) {
    return (
      <p className={cn("px-2 py-4 text-sm text-muted-foreground", className)}>
        {t("permissions.installFirst")}
      </p>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {ORDER.map((name) => {
        const granted =
          name === "accessibility"
            ? doctor?.accessibility === true
            : doctor?.screen_recording === true;
        const title =
          name === "accessibility"
            ? t("permissions.items.accessibility.title")
            : t("permissions.items.screenRecording.title");
        const description =
          name === "accessibility"
            ? t("permissions.items.accessibility.description")
            : t("permissions.items.screenRecording.description");
        const isGranting = grantingTarget === name;
        const PermissionIcon = PERMISSION_ICONS[name];

        return (
          <div
            key={name}
            className="border-b border-border px-2 py-4 last:border-b-0"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
              <div>
                <p className="text-base font-medium text-foreground">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
              <div className="flex items-center justify-end">
                {granted ? (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check className="size-4" />
                    {t("permissions.done")}
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void openGrant(name)}
                    className="cursor-pointer"
                  >
                    {isGranting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PermissionIcon className="size-4" />
                    )}
                    {t("permissions.grant")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3 border-t border-border px-2 py-3">
        <div className="min-w-0">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("permissions.hostLine", {
                  host: doctor?.host_app_name ?? t("host.defaultName"),
                })}
              </p>
              {doctor?.accessibility !== true ? (
                <p className="text-xs text-muted-foreground">
                  {t("permissions.dragHint")}
                </p>
              ) : null}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void refresh("manual")}
          className="cursor-pointer"
        >
          {manualRefreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t("actions.refresh")}
        </Button>
      </div>
    </div>
  );
}
