"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@workspace/ui";
import {
  Accessibility,
  AlertCircle,
  MonitorPlay,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useOpenDesktopUseSettings } from "@/features/appshot/lib/open-desktop-use-settings";
import {
  closeDesktopUseReadinessModal,
  subscribeDesktopUseReadinessModal,
  type DesktopUseReadinessModalState,
} from "../lib/readiness-modal-bus";
import { invalidateDesktopUseReadinessCache } from "../lib/readiness";
import type { DesktopUseReadinessReason } from "../lib/readiness";

/** Ignore dismiss / clicks for this long after open (Popover→Dialog handoff race). */
const OPEN_SETTLE_MS = 400;

function reasonMessageKey(
  reason: DesktopUseReadinessReason | null | undefined,
): string {
  switch (reason) {
    case "web_only":
      return "reason.webOnly";
    case "engine_not_installed":
      return "reason.engineNotInstalled";
    case "engine_not_running":
      return "reason.engineNotRunning";
    case "permission_accessibility":
      return "reason.permissionAccessibility";
    case "permission_screen_recording":
      return "reason.permissionScreenRecording";
    case "permission_both":
      return "reason.permissionBoth";
    default:
      return "reason.unknown";
  }
}

function isPermissionReason(
  reason: DesktopUseReadinessReason | null | undefined,
): boolean {
  return (
    reason === "permission_accessibility" ||
    reason === "permission_screen_recording" ||
    reason === "permission_both"
  );
}

/** Primary CTA icon — permission figure/screen, not a generic settings gear. */
function primaryCtaIcon(
  reason: DesktopUseReadinessReason | null | undefined,
): LucideIcon {
  switch (reason) {
    case "permission_accessibility":
    case "permission_both":
      return Accessibility;
    case "permission_screen_recording":
      return MonitorPlay;
    case "engine_not_installed":
    case "engine_not_running":
      return Package;
    default:
      return Accessibility;
  }
}

export function DesktopUseReadinessDialog() {
  const t = useTranslations("desktopUse.readinessModal");
  const openDesktopUseSettings = useOpenDesktopUseSettings();
  const [state, setState] = React.useState<DesktopUseReadinessModalState>({
    open: false,
    readiness: null,
  });
  /** After open, block outside-dismiss and button clicks until the open gesture settles. */
  const [settled, setSettled] = React.useState(false);
  const openedAtRef = React.useRef(0);

  React.useEffect(() => subscribeDesktopUseReadinessModal(setState), []);

  React.useEffect(() => {
    if (!state.open) {
      setSettled(false);
      return;
    }
    openedAtRef.current = Date.now();
    setSettled(false);
    const id = window.setTimeout(() => setSettled(true), OPEN_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [state.open, state.readiness?.checkedAt, state.source]);

  const reason = state.readiness?.reason ?? null;
  const source = state.source ?? "generic";
  const primaryLabel = isPermissionReason(reason)
    ? t("grant")
    : t("openSettings");

  const isWithinSettleWindow = () =>
    Date.now() - openedAtRef.current < OPEN_SETTLE_MS;

  const onOpenSettings = () => {
    if (!settled || isWithinSettleWindow()) return;
    closeDesktopUseReadinessModal();
    // Force next entry to re-check after user may install / grant.
    invalidateDesktopUseReadinessCache();
    // nuqs path — reliable under NuqsAdapter (unlike bare pushState + popstate).
    openDesktopUseSettings();
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        // Swallow the synthetic dismiss that fires when a Popover closes in the
        // same gesture that opened this dialog (Appshots / slash popovers).
        if (!open) {
          if (!settled || isWithinSettleWindow()) return;
          closeDesktopUseReadinessModal();
        }
      }}
      modal
    >
      {/*
        High z-index: Appshots history uses an extreme ceiling. Settle window
        disables pointer events so the opening click cannot ghost-activate
        "Open settings" (which wrote URL params and made Settings appear later).
      */}
      <DialogContent
        showCloseButton={settled}
        className={cn(
          "!z-[2147483647]",
          !settled && "pointer-events-none",
        )}
        overlayClassName={cn(
          "!z-[2147483647]",
          !settled && "pointer-events-none",
        )}
        onOpenAutoFocus={(event) => {
          // Do not focus the primary CTA — avoids Enter/ghost activation.
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!settled || isWithinSettleWindow()) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (!settled || isWithinSettleWindow()) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (!settled || isWithinSettleWindow()) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-amber-500/10">
            <AlertCircle className="size-5 text-amber-600" />
          </div>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-pretty text-sm text-muted-foreground">
              <p>{t(`source.${source}`)}</p>
              <p className="font-medium text-foreground">
                {t(reasonMessageKey(reason))}
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>{t("needs.engine")}</li>
                <li>{t("needs.accessibility")}</li>
                <li>{t("needs.screenRecording")}</li>
              </ul>
              <p className="text-xs leading-5">{t("hint")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!settled}
            onClick={() => {
              if (!settled || isWithinSettleWindow()) return;
              closeDesktopUseReadinessModal();
            }}
            className="cursor-pointer"
          >
            {t("dismiss")}
          </Button>
          <Button
            type="button"
            disabled={!settled}
            onClick={onOpenSettings}
            className="cursor-pointer"
          >
            {React.createElement(primaryCtaIcon(reason), {
              className: "size-4",
            })}
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
