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
} from "@workspace/ui";
import { AlertCircle, Settings2 } from "lucide-react";
import { openDesktopUseSettingsInApp } from "@/features/appshot/lib/open-desktop-use-settings";
import {
  closeDesktopUseReadinessModal,
  subscribeDesktopUseReadinessModal,
  type DesktopUseReadinessModalState,
} from "../lib/readiness-modal-bus";
import { invalidateDesktopUseReadinessCache } from "../lib/readiness";
import type { DesktopUseReadinessReason } from "../lib/readiness";

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

export function DesktopUseReadinessDialog() {
  const t = useTranslations("desktopUse.readinessModal");
  const [state, setState] = React.useState<DesktopUseReadinessModalState>({
    open: false,
    readiness: null,
  });

  React.useEffect(() => subscribeDesktopUseReadinessModal(setState), []);

  const reason = state.readiness?.reason ?? null;
  const source = state.source ?? "generic";

  const onOpenSettings = () => {
    closeDesktopUseReadinessModal();
    // Force next entry to re-check after user may install / grant.
    invalidateDesktopUseReadinessCache();
    // Non-hook path: safe in root layout prerender (no useSearchParams).
    openDesktopUseSettingsInApp();
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeDesktopUseReadinessModal();
      }}
    >
      <DialogContent showCloseButton>
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
            onClick={() => closeDesktopUseReadinessModal()}
            className="cursor-pointer"
          >
            {t("dismiss")}
          </Button>
          <Button
            type="button"
            onClick={onOpenSettings}
            className="cursor-pointer"
          >
            <Settings2 className="size-4" />
            {t("openSettings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
