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
import { useOpenDesktopUseSettings } from "@/features/appshot/lib/open-desktop-use-settings";

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
  /**
   * Publish the Refresh control to the Permissions group header (far right).
   * Parent should render the node on SettingsGroupCard `headerEnd`.
   */
  onHeaderEndChange?: (node: React.ReactNode) => void;
  /**
   * Engine install state from the parent section (status IPC).
   * When this flips after install/uninstall, re-run doctor so permission rows
   * appear without requiring the user to collapse/expand the group.
   */
  engineInstalledFromParent?: boolean | null;
  /**
   * Bumps after parent driver actions (install / update / stop / uninstall).
   * Forces a silent doctor refresh even when install flag is unchanged.
   */
  doctorRefreshToken?: number;
};

export function DesktopUsePermissionsPanel({
  className,
  onHeaderEndChange,
  engineInstalledFromParent = null,
  doctorRefreshToken = 0,
}: DesktopUsePermissionsPanelProps) {
  const t = useTranslations("settings.desktopUse");
  const openDesktopUseSettings = useOpenDesktopUseSettings();
  const [doctor, setDoctor] = React.useState<DoctorStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [manualRefreshing, setManualRefreshing] = React.useState(false);
  const [grantingTarget, setGrantingTarget] = React.useState<PermissionName | null>(
    null,
  );
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = React.useRef(true);
  /** Which grant overlay is currently open (so we close only when that one succeeds). */
  const activeGrantRef = React.useRef<PermissionName | null>(null);
  /** Skip the first parent-driven refresh — mount effect already loads doctor. */
  const parentSyncSkipRef = React.useRef(true);

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
        // Dismiss drag panel only when the permission we just asked for is granted.
        const pending = activeGrantRef.current;
        const done =
          pending === "accessibility"
            ? d?.accessibility === true
            : pending === "screen_recording"
              ? d?.screen_recording === true
              : false;
        if (done) {
          activeGrantRef.current = null;
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

  // Parent engine install / driver actions must refresh doctor in place.
  // Without this, Collapsible keeps the panel mounted and the user still sees
  // "install first" until they collapse/expand the Permissions group.
  React.useEffect(() => {
    if (parentSyncSkipRef.current) {
      parentSyncSkipRef.current = false;
      return;
    }
    void refresh("silent");
  }, [engineInstalledFromParent, doctorRefreshToken, refresh]);

  const engineInstalled = Boolean(
    doctor?.engine_installed || engineInstalledFromParent === true,
  );
  const busy = manualRefreshing || grantingTarget !== null;

  // Publish Refresh to the Permissions group header (not per-row).
  React.useEffect(() => {
    if (!onHeaderEndChange) return;
    if (!isDesktopRuntime() || !engineInstalled) {
      onHeaderEndChange(null);
      return;
    }
    onHeaderEndChange(
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
      </Button>,
    );
    return () => onHeaderEndChange(null);
  }, [
    onHeaderEndChange,
    engineInstalled,
    busy,
    manualRefreshing,
    refresh,
    t,
  ]);

  const openGrant = async (
    target: PermissionName,
    anchorEl?: HTMLElement | null,
  ) => {
    if (!isDesktopRuntime() || !engineInstalled) return;
    setGrantingTarget(target);
    activeGrantRef.current = target;
    setError(null);
    try {
      const locale =
        typeof navigator !== "undefined" ? navigator.language : undefined;
      // Viewport-relative rect so the desktop shell can fly the grant card
      // from this button into System Settings.
      let anchor:
        | { x: number; y: number; width: number; height: number }
        | undefined;
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          anchor = {
            x: r.left,
            y: r.top,
            width: r.width,
            height: r.height,
          };
        }
      }
      await desktopInvoke("desktop_use_grant_permissions", {
        target,
        locale,
        ...(anchor ? { anchor } : {}),
      });
      invalidateDesktopUseReadinessCache();
      stopPoll();
      const started = Date.now();
      pollRef.current = setInterval(() => {
        if (Date.now() - started > 120_000) {
          stopPoll();
          activeGrantRef.current = null;
          return;
        }
        void refresh("silent");
      }, 2000);
      await refresh("silent");
    } catch (e) {
      activeGrantRef.current = null;
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
      <div className={cn("flex items-center justify-between gap-3 px-2 py-4", className)}>
        <p className="text-sm text-muted-foreground">{t("permissions.installFirst")}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer shrink-0"
          onClick={() => openDesktopUseSettings()}
        >
          {t("groups.engine.title")}
        </Button>
      </div>
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
            className="border-b border-border/60 px-2 py-3 last:border-b-0"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6">
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
                    onClick={(e) => void openGrant(name, e.currentTarget)}
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

      {error ? (
        <p className="px-2 py-2 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
