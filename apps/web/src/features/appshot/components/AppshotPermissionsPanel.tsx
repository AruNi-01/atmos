"use client";

/**
 * Reusable macOS permission panel for Desktop Use Settings and legacy shells.
 * Does not open a separate window — parent owns layout.
 */

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, cn } from "@workspace/ui";
import {
  Check,
  Loader2,
  MonitorUp,
  MousePointer2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  getAppshotStatus,
  openAppshotPermissionTarget,
  watchAppshotStatusAfterPermissionOpen,
} from "../lib/appshot-client";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";
import type {
  AppshotPermissionName,
  AppshotPermissionState,
  AppshotStatus,
  AppshotSettingsTarget,
} from "../types";

const PERMISSION_ORDER: AppshotPermissionName[] = [
  "accessibility",
  "screen_recording",
];

type Translator = ReturnType<typeof useTranslations>;

export type AppshotPermissionsPanelProps = {
  /** Compact layout for embedding inside Settings. */
  embedded?: boolean;
  /** Optional product title override (defaults to AppShot / Desktop Use copy). */
  titleKey?: "permissionsWindow.title" | "desktopUseTitle";
  className?: string;
};

export function AppshotPermissionsPanel({
  embedded = false,
  className,
}: AppshotPermissionsPanelProps) {
  const t = useTranslations("appshot.components");
  const [status, setStatus] = React.useState<AppshotStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [openingTarget, setOpeningTarget] = React.useState<AppshotSettingsTarget | null>(null);
  const [useHostIdentity, setUseHostIdentity] = React.useState(false);
  const watcherRef = React.useRef<(() => void) | null>(null);

  const refreshStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Prefer Atmos Desktop Use host doctor when control engine is installed
      // so AppShot + control share one TCC product identity.
      if (isDesktopRuntime()) {
        try {
          const doctor = (await desktopInvoke("desktop_use_doctor")) as {
            engine_installed?: boolean;
            accessibility?: boolean | null;
            screen_recording?: boolean | null;
            host_app_name?: string;
          };
          if (doctor?.engine_installed) {
            setUseHostIdentity(true);
            setStatus(
              statusFromHostDoctor(doctor, t("permissionsWindow.grant")),
            );
            return;
          }
        } catch {
          /* fall through to AppShot Electron status */
        }
      }
      setUseHostIdentity(false);
      setStatus(await getAppshotStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void refreshStatus();
    return () => {
      watcherRef.current?.();
    };
  }, [refreshStatus]);

  const permissions = normalizePermissions(status, t);
  const ready = permissions.every((permission) => permission.granted);

  const grantPermission = React.useCallback(
    async (permission: AppshotPermissionState) => {
      const target = permission.recovery_action?.target ?? permission.name;
      setOpeningTarget(target);
      setError(null);
      try {
        if (useHostIdentity && isDesktopRuntime()) {
          // Single host: Atmos Desktop Use.app grant flow for AppShot + control.
          await desktopInvoke("desktop_use_grant_permissions");
        } else {
          await openAppshotPermissionTarget(target);
        }
        watcherRef.current?.();
        watcherRef.current = watchAppshotStatusAfterPermissionOpen(refreshStatus, 20_000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOpeningTarget(null);
        window.setTimeout(() => {
          void refreshStatus();
        }, 700);
      }
    },
    [refreshStatus, useHostIdentity],
  );

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {!embedded ? (
        <div className="flex min-w-0 gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background">
            <ShieldCheck className="size-6 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("permissionsWindow.title")}
              </h1>
              <Badge variant="outline" className="rounded-md text-[10px] font-normal">
                {t("permissionsWindow.macosPermissions")}
              </Badge>
            </div>
            <p className="mt-2 max-w-[560px] text-sm leading-6 text-muted-foreground">
              {t("permissionsWindow.description")}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{t("permissionsWindow.macosPermissions")}</h3>
            <Badge variant="outline" className="rounded-md text-[10px] font-normal">
              macOS
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("permissionsWindow.description")}
          </p>
        </div>
      )}

      <div className={cn("space-y-3", embedded ? "mt-1" : "mt-8 flex-1")}>
        {permissions.map((permission) => (
          <PermissionRow
            key={permission.name}
            permission={permission}
            opening={openingTarget === (permission.recovery_action?.target ?? permission.name)}
            onGrant={grantPermission}
          />
        ))}
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-4",
          embedded ? "pt-3" : "pt-5",
        )}
      >
        <div className="min-w-0">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : ready ? (
            <p className="text-sm text-muted-foreground">{t("permissionsWindow.ready")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("permissionsWindow.grantBothPermissions")}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refreshStatus()}
          disabled={loading}
          className="cursor-pointer"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t("permissionsWindow.refresh")}
        </Button>
      </div>
    </div>
  );
}

function PermissionRow({
  permission,
  opening,
  onGrant,
}: {
  permission: AppshotPermissionState;
  opening: boolean;
  onGrant: (permission: AppshotPermissionState) => Promise<void>;
}) {
  const t = useTranslations("appshot.components");
  const copy = getPermissionCopy(t)[permission.name];
  const Icon = copy.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border border-border bg-background/60 p-4",
        permission.granted && "border-emerald-500/25 bg-emerald-500/5",
      )}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.description}</p>
      </div>
      {permission.granted ? (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-emerald-500">
          <Check className="size-4" />
          {t("permissionsWindow.done")}
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={opening}
          onClick={() => void onGrant(permission)}
          className="shrink-0 cursor-pointer"
        >
          {opening ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("permissionsWindow.grant")}
        </Button>
      )}
    </div>
  );
}

function getPermissionCopy(
  t: Translator,
): Record<
  AppshotPermissionName,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> {
  return {
    accessibility: {
      title: t("permissionsWindow.permissions.accessibility.title"),
      description: t("permissionsWindow.permissions.accessibility.description"),
      icon: MousePointer2,
    },
    screen_recording: {
      title: t("permissionsWindow.permissions.screenRecording.title"),
      description: t("permissionsWindow.permissions.screenRecording.description"),
      icon: MonitorUp,
    },
  };
}

function statusFromHostDoctor(
  doctor: {
    accessibility?: boolean | null;
    screen_recording?: boolean | null;
    host_app_name?: string;
  },
  grantLabel: string,
): AppshotStatus {
  const ax = Boolean(doctor.accessibility);
  const screen = Boolean(doctor.screen_recording);
  const mk = (
    name: AppshotPermissionName,
    granted: boolean,
  ): AppshotPermissionState => ({
    name,
    display_name: name === "accessibility" ? "Accessibility" : "Screen Recording",
    granted,
    required_for: name === "accessibility" ? ["accessibility_tree", "control"] : ["capture", "control"],
    recovery_action: granted
      ? null
      : {
          label: grantLabel,
          target: name,
          manual_steps: [
            `Open System Settings → Privacy & Security and enable ${name === "accessibility" ? "Accessibility" : "Screen Recording"} for Atmos Desktop Use.`,
          ],
        },
  });
  return {
    supported: true,
    platform: "macos",
    reason: null,
    trigger: {
      mode: "macos_modifier_gesture",
      enabled: ax,
      required_modifiers: [],
      last_error: null,
      permissions: [mk("accessibility", ax)],
    },
    permissions: [mk("accessibility", ax), mk("screen_recording", screen)],
  };
}

function normalizePermissions(
  status: AppshotStatus | null,
  t: Translator,
): AppshotPermissionState[] {
  const permissionCopy = getPermissionCopy(t);
  const byName = new Map<AppshotPermissionName, AppshotPermissionState>();
  for (const permission of [
    ...(status?.permissions ?? []),
    ...(status?.trigger.permissions ?? []),
  ]) {
    byName.set(permission.name, permission);
  }

  return PERMISSION_ORDER.map((name) => {
    const existing = byName.get(name);
    if (existing) {
      return existing;
    }
    return {
      name,
      display_name: permissionCopy[name].title,
      granted: false,
      required_for: [],
      recovery_action: {
        label: t("permissionsWindow.grant"),
        target: name,
        manual_steps: [],
      },
    };
  });
}
