"use client";

/**
 * Legacy route shell for /appshot-permissions.
 * APP-052: permissions live on Settings → Desktop Use (Atmos Desktop Use host).
 * This page is a thin shell that shows the same Desktop Use panel.
 */

import React from "react";
import { useTranslations } from "next-intl";
import { DesktopUsePermissionsPanel } from "@/features/settings/components/DesktopUsePermissionsPanel";
import { openDesktopUseSettingsInApp } from "../lib/open-desktop-use-settings";
import { Button } from "@workspace/ui";

export function AppshotPermissionsWindow() {
  const t = useTranslations("settings.desktopUse");

  return (
    <main className="flex h-dvh flex-col bg-popover text-popover-foreground">
      <div className="desktop-drag-region h-11 shrink-0" />
      <section className="desktop-no-drag flex min-h-0 flex-1 flex-col px-8 pb-8 pt-2">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {t("permissions.title")}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {t("permissions.unifiedHint")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer shrink-0"
            onClick={() => openDesktopUseSettingsInApp()}
          >
            {t("title")}
          </Button>
        </div>
        <DesktopUsePermissionsPanel />
      </section>
    </main>
  );
}
