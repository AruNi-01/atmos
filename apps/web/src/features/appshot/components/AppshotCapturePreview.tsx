"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Button, cn } from "@workspace/ui";
import { Check, Copy, ImageOff, Trash2, XCircle } from "lucide-react";

import {
  acceptAppshotPending,
  discardAppshotPending,
  getAppshotStatus,
  listenAppshotPreview,
  openAppshotPermissionTarget,
  setAppshotPendingAutoAccept,
  watchAppshotStatusAfterPermissionOpen,
} from "../lib/appshot-client";
import {
  sanitizePendingPreviewPayload,
  toBoundedScreenshotDataUrl,
} from "../lib/appshot-payload";
import { formatQualityLabel } from "../lib/appshot-protocol";
import type { AppshotPendingPreview, AppshotPermissionState } from "../types";

type ResolveState = "idle" | "accepting" | "discarding";
type EntranceOffset = { x: number; y: number };

export function AppshotCapturePreview() {
  const [preview, setPreview] = React.useState<AppshotPendingPreview | null>(null);
  const [resolveState, setResolveState] = React.useState<ResolveState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [remainingMs, setRemainingMs] = React.useState(0);
  const [countdownPaused, setCountdownPaused] = React.useState(false);
  const [entranceOffset, setEntranceOffset] = React.useState<EntranceOffset>({
    x: 0,
    y: -18,
  });
  const previewRef = React.useRef<AppshotPendingPreview | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const countdownIntervalRef = React.useRef<number | null>(null);
  const deadlineRef = React.useRef<number | null>(null);
  const remainingMsRef = React.useRef(0);
  const resolvingRef = React.useRef(false);
  const mountedRef = React.useRef(false);
  const permissionWatcherRef = React.useRef<(() => void) | null>(null);
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);

  const clearCountdownInterval = React.useCallback(() => {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearCountdownInterval();
    deadlineRef.current = null;
  }, [clearCountdownInterval]);

  const clearPermissionWatcher = React.useCallback(() => {
    permissionWatcherRef.current?.();
    permissionWatcherRef.current = null;
  }, []);

  const updateRemainingFromDeadline = React.useCallback(() => {
    const deadline = deadlineRef.current;
    if (deadline === null) {
      return;
    }
    const nextRemaining = Math.max(0, deadline - Date.now());
    remainingMsRef.current = nextRemaining;
    setRemainingMs(nextRemaining);
  }, []);

  const closePreview = React.useCallback(() => {
    clearTimer();
    clearPermissionWatcher();
    resolvingRef.current = false;
    previewRef.current = null;
    remainingMsRef.current = 0;
    setPreview(null);
    setError(null);
    setRemainingMs(0);
    setCountdownPaused(false);
    setResolveState("idle");
  }, [clearPermissionWatcher, clearTimer]);

  const acceptPreview = React.useCallback(
    async (targetPreview: AppshotPendingPreview | null = previewRef.current) => {
      if (!targetPreview || resolvingRef.current) {
        return;
      }
      resolvingRef.current = true;
      clearTimer();
      setResolveState("accepting");
      setError(null);

      try {
        await acceptAppshotPending(targetPreview.preview_id);
        closePreview();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("no longer pending")) {
          closePreview();
          return;
        }
        resolvingRef.current = false;
        setResolveState("idle");
        setError(message);
      }
    },
    [clearTimer, closePreview],
  );

  const startAutoAcceptCountdown = React.useCallback(
    (targetPreview: AppshotPendingPreview, durationMs: number) => {
      clearTimer();
      const delayMs = Math.max(500, durationMs);
      deadlineRef.current = Date.now() + delayMs;
      remainingMsRef.current = delayMs;
      setRemainingMs(delayMs);
      setCountdownPaused(false);
      countdownIntervalRef.current = window.setInterval(updateRemainingFromDeadline, 200);
      timerRef.current = window.setTimeout(() => {
        void acceptPreview(targetPreview);
      }, delayMs);
    },
    [acceptPreview, clearTimer, updateRemainingFromDeadline],
  );

  const discardPreview = React.useCallback(async () => {
    const targetPreview = previewRef.current;
    if (!targetPreview || resolvingRef.current) {
      return;
    }
    resolvingRef.current = true;
    clearTimer();
    setResolveState("discarding");
    setError(null);

    try {
      await discardAppshotPending(targetPreview.preview_id);
      closePreview();
    } catch (err) {
      resolvingRef.current = false;
      setResolveState("idle");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [clearTimer, closePreview]);

  const pauseAutoAcceptCountdown = React.useCallback(() => {
    const targetPreview = previewRef.current;
    if (!targetPreview || targetPreview.expires_in_ms <= 0 || resolvingRef.current) {
      return;
    }

    const nextRemaining = Math.max(
      0,
      deadlineRef.current === null
        ? remainingMsRef.current
        : deadlineRef.current - Date.now(),
    );
    clearTimer();
    remainingMsRef.current = nextRemaining;
    setRemainingMs(nextRemaining);
    setCountdownPaused(true);
    void setAppshotPendingAutoAccept(targetPreview.preview_id, true).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [clearTimer]);

  const resumeAutoAcceptCountdown = React.useCallback(() => {
    const targetPreview = previewRef.current;
    if (
      !targetPreview ||
      targetPreview.expires_in_ms <= 0 ||
      resolvingRef.current ||
      !countdownPaused
    ) {
      return;
    }

    const delayMs = Math.max(500, remainingMsRef.current);
    void setAppshotPendingAutoAccept(targetPreview.preview_id, false, delayMs).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    startAutoAcceptCountdown(targetPreview, delayMs);
  }, [countdownPaused, startAutoAcceptCountdown]);

  const refreshPreviewPermissions = React.useCallback(async () => {
    const status = await getAppshotStatus();
    const permissions = [...status.permissions, ...status.trigger.permissions];

    setPreview((current) => {
      if (!current) {
        return current;
      }
      const nextPreview = { ...current, permissions };
      previewRef.current = nextPreview;
      return nextPreview;
    });
  }, []);

  const watchPreviewPermissionsAfterOpen = React.useCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    clearPermissionWatcher();
    permissionWatcherRef.current =
      watchAppshotStatusAfterPermissionOpen(refreshPreviewPermissions);
  }, [clearPermissionWatcher, refreshPreviewPermissions]);

  React.useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listenAppshotPreview((incomingPreview) => {
      if (cancelled) {
        return;
      }
      const nextPreview = sanitizePendingPreviewPayload(incomingPreview);
      clearTimer();
      resolvingRef.current = false;
      previewRef.current = nextPreview;
      setEntranceOffset(computeEntranceOffset(nextPreview));
      setPreview(nextPreview);
      setResolveState("idle");
      setError(null);
      if (nextPreview.expires_in_ms > 0) {
        startAutoAcceptCountdown(nextPreview, nextPreview.expires_in_ms);
      } else {
        setRemainingMs(0);
        setCountdownPaused(false);
      }
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      mountedRef.current = false;
      cancelled = true;
      clearTimer();
      clearPermissionWatcher();
      unlisten?.();
    };
  }, [clearPermissionWatcher, clearTimer, startAutoAcceptCountdown]);

  React.useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  if (!preview || !portalContainer) {
    return null;
  }

  const screenshotSrc = toBoundedScreenshotDataUrl(preview.screenshot_preview_base64);
  const busy = resolveState !== "idle";
  const deniedPermissions = (preview.permissions ?? []).filter((permission) => !permission.granted);
  const countdownSeconds = Math.ceil(remainingMs / 1_000);
  const countdownLabel = countdownPaused
    ? `Paused ${countdownSeconds}s`
    : `${countdownSeconds}s`;

  return createPortal(
    <div
      key={preview.preview_id}
      className={cn(
        "appshot-capture-card-enter fixed right-4 top-12 z-[2147483647] w-80 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md desktop-no-drag",
      )}
      style={{
        "--appshot-enter-x": `${entranceOffset.x}px`,
        "--appshot-enter-y": `${entranceOffset.y}px`,
      } as React.CSSProperties}
      role="status"
      aria-live="polite"
      onMouseEnter={pauseAutoAcceptCountdown}
      onMouseLeave={resumeAutoAcceptCountdown}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{preview.app_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {preview.window_title || formatQualityLabel(preview.quality)}
            </p>
          </div>
          {preview.expires_in_ms > 0 ? (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {countdownLabel}
            </span>
          ) : (
            <span className="rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
              Needs permission
            </span>
          )}
        </div>

        <div className="h-36 overflow-hidden rounded-md border border-border bg-background">
          {screenshotSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- Appshot previews are local Tauri data URLs, not remote optimized assets.
            <img
              src={screenshotSrc}
              alt={`Appshot preview for ${preview.app_name}`}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="size-5" />
              <span className="text-xs">No screenshot preview</span>
            </div>
          )}
        </div>

        {preview.warnings.length > 0 ? (
          <p className="line-clamp-2 text-xs text-warning">
            {preview.warnings[0]}
          </p>
        ) : null}

        {deniedPermissions.length > 0 ? (
          <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-2">
            <p className="text-xs font-medium text-popover-foreground">
              Permissions required
            </p>
            {deniedPermissions.map((permission) => (
              <PreviewPermissionAction
                key={permission.name}
                permission={permission}
                onError={setError}
                onWatchAfterOpen={watchPreviewPermissionsAfterOpen}
              />
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="flex-1 cursor-pointer"
            size="sm"
            disabled={busy}
            onClick={() => void acceptPreview()}
          >
            {resolveState === "accepting" ? (
              <>
                <Check className="size-4" />
                Copying...
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void discardPreview()}
            className="cursor-pointer"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>,
    portalContainer,
  );
}

function computeEntranceOffset(preview: AppshotPendingPreview): EntranceOffset {
  const bounds = preview.source_bounds;
  if (!bounds || typeof window === "undefined") {
    return { x: 0, y: -18 };
  }

  const screenX = window.screenX || window.screenLeft || 0;
  const screenY = window.screenY || window.screenTop || 0;
  const targetCenterX = window.innerWidth - 16 - 160;
  const targetCenterY = 48 + 180;
  const sourceCenterX = bounds.x + bounds.width / 2 - screenX;
  const sourceCenterY = bounds.y + bounds.height / 2 - screenY;

  return {
    x: clamp(sourceCenterX - targetCenterX, -900, 900),
    y: clamp(sourceCenterY - targetCenterY, -700, 700),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function PreviewPermissionAction({
  permission,
  onError,
  onWatchAfterOpen,
}: {
  permission: AppshotPermissionState;
  onError: (message: string) => void;
  onWatchAfterOpen: () => void;
}) {
  const action = permission.recovery_action;

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-popover-foreground">
          {permission.display_name}
        </p>
        <p className="text-[11px] leading-5 text-muted-foreground">
          {permission.required_for.join("; ")}
        </p>
      </div>
      {action ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="shrink-0 cursor-pointer"
          onClick={() => {
            void openAppshotPermissionTarget(action.target)
              .then(() => {
                onWatchAfterOpen();
              })
              .catch((err) => {
                onError(err instanceof Error ? err.message : String(err));
              });
          }}
        >
          {action.label || "Open Settings"}
        </Button>
      ) : null}
    </div>
  );
}
