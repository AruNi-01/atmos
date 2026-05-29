"use client";

import React from "react";
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

const PERMISSION_COPY: Record<
  AppshotPermissionName,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  accessibility: {
    title: "Accessibility",
    description: "Lets Atmos read app structure, labels, and focused-window context.",
    icon: MousePointer2,
  },
  screen_recording: {
    title: "Screen Recording",
    description: "Lets Atmos capture the focused window as a local Appshot preview.",
    icon: MonitorUp,
  },
};

export function AppshotPermissionsWindow() {
  const [status, setStatus] = React.useState<AppshotStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [openingTarget, setOpeningTarget] = React.useState<AppshotSettingsTarget | null>(null);
  const watcherRef = React.useRef<(() => void) | null>(null);

  const refreshStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getAppshotStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshStatus();
    return () => {
      watcherRef.current?.();
    };
  }, [refreshStatus]);

  const permissions = normalizePermissions(status);
  const ready = permissions.every((permission) => permission.granted);

  const grantPermission = React.useCallback(
    async (permission: AppshotPermissionState) => {
      const target = permission.recovery_action?.target ?? permission.name;
      setOpeningTarget(target);
      setError(null);
      try {
        await openAppshotPermissionTarget(target);
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
    [refreshStatus],
  );

  return (
    <main className="flex h-dvh flex-col bg-popover text-popover-foreground">
      <div className="desktop-drag-region h-11 shrink-0" />
      <section className="desktop-no-drag flex min-h-0 flex-1 flex-col px-8 pb-8 pt-2">
        <div className="flex min-w-0 gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background">
            <ShieldCheck className="size-6 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Enable Appshots</h1>
              <Badge variant="outline" className="rounded-md text-[10px] font-normal">
                macOS permissions
              </Badge>
            </div>
            <p className="mt-2 max-w-[560px] text-sm leading-6 text-muted-foreground">
              Atmos needs local access to read focused app structure and capture
              window previews for Appshots.
            </p>
          </div>
        </div>

        <div className="mt-8 flex-1 space-y-3">
          {permissions.map((permission) => (
            <PermissionRow
              key={permission.name}
              permission={permission}
              opening={openingTarget === (permission.recovery_action?.target ?? permission.name)}
              onGrant={grantPermission}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 pt-5">
          <div className="min-w-0">
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : ready ? (
              <p className="text-sm text-muted-foreground">Appshots are ready.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Grant both permissions, then return to Atmos.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
              Refresh
            </Button>
          </div>
        </div>
      </section>
    </main>
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
  const copy = PERMISSION_COPY[permission.name];
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
          Done
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
          Grant
        </Button>
      )}
    </div>
  );
}

function normalizePermissions(status: AppshotStatus | null): AppshotPermissionState[] {
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
      display_name: PERMISSION_COPY[name].title,
      granted: false,
      required_for: [],
      recovery_action: {
        label: "Grant",
        target: name,
        manual_steps: [],
      },
    };
  });
}
