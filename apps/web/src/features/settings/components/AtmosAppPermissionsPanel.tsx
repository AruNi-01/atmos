"use client";

/**
 * macOS TCC grants for Atmos.app (host shortcuts, AppShot fallback).
 * Desktop Use has its own identity and panel.
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
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";

type PermissionName = "accessibility" | "screen_recording";

type MacosAppPermissionsStatus = {
  supported?: boolean;
  platform?: string;
  app_name?: string;
  accessibility?: boolean;
  screen_recording?: boolean;
};

const ORDER: PermissionName[] = ["accessibility", "screen_recording"];

const PERMISSION_ICONS: Record<PermissionName, LucideIcon> = {
  accessibility: Accessibility,
  screen_recording: MonitorPlay,
};

export type AtmosAppPermissionsPanelProps = {
  className?: string;
  onHeaderEndChange?: (node: React.ReactNode) => void;
};

export function AtmosAppPermissionsPanel({
  className,
  onHeaderEndChange,
}: AtmosAppPermissionsPanelProps) {
  const t = useTranslations("settings.modal.permissionAccessSection.atmosApp");
  const [status, setStatus] = React.useState<MacosAppPermissionsStatus | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [manualRefreshing, setManualRefreshing] = React.useState(false);
  const [grantingTarget, setGrantingTarget] = React.useState<PermissionName | null>(
    null,
  );
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = React.useRef(true);
  const activeGrantRef = React.useRef<PermissionName | null>(null);

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
          if (mountedRef.current) setStatus(null);
          return;
        }
        const next = await desktopInvoke<MacosAppPermissionsStatus>(
          "macos_app_permissions_status",
        );
        if (mountedRef.current) setStatus(next);
        const pending = activeGrantRef.current;
        const done =
          pending === "accessibility"
            ? next?.accessibility === true
            : pending === "screen_recording"
              ? next?.screen_recording === true
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
            setError(e instanceof Error ? e.message : t("statusFailed"));
          }
          if (mode === "initial") setStatus(null);
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

  const supported = status?.supported === true;
  const busy = manualRefreshing || grantingTarget !== null;

  React.useEffect(() => {
    if (!onHeaderEndChange) return;
    if (!isDesktopRuntime() || !supported) {
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
        {t("refresh")}
      </Button>,
    );
    return () => onHeaderEndChange(null);
  }, [
    onHeaderEndChange,
    supported,
    busy,
    manualRefreshing,
    refresh,
    t,
  ]);

  const openGrant = async (
    target: PermissionName,
    anchorEl?: HTMLElement | null,
  ) => {
    if (!isDesktopRuntime() || !supported) return;
    setGrantingTarget(target);
    activeGrantRef.current = target;
    setError(null);
    try {
      const locale =
        typeof navigator !== "undefined" ? navigator.language : undefined;
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
      await desktopInvoke("macos_app_permissions_grant", {
        target,
        locale,
        ...(anchor ? { anchor } : {}),
      });
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
      setError(e instanceof Error ? e.message : t("grantFailed"));
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

  if (initialLoading && !status) {
    return (
      <div className={cn("space-y-0 px-2 py-2", className)}>
        <div className="h-16 animate-pulse rounded-lg bg-muted/40" />
        <div className="mt-2 h-16 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (!supported) {
    return (
      <p className={cn("px-2 py-4 text-sm text-muted-foreground", className)}>
        {t("macosOnly")}
      </p>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {ORDER.map((name) => {
        const granted =
          name === "accessibility"
            ? status?.accessibility === true
            : status?.screen_recording === true;
        const title =
          name === "accessibility"
            ? t("items.accessibility.title")
            : t("items.screenRecording.title");
        const description =
          name === "accessibility"
            ? t("items.accessibility.description")
            : t("items.screenRecording.description");
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
                    {t("done")}
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
                    {t("grant")}
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
