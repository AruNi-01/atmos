"use client";

/**
 * Legacy route shell for /appshot-permissions.
 * Primary path is Settings → Desktop Use; this page embeds the same panel.
 */

import React from "react";
import { AppshotPermissionsPanel } from "./AppshotPermissionsPanel";

export function AppshotPermissionsWindow() {
  return (
    <main className="flex h-dvh flex-col bg-popover text-popover-foreground">
      <div className="desktop-drag-region h-11 shrink-0" />
      <section className="desktop-no-drag flex min-h-0 flex-1 flex-col px-8 pb-8 pt-2">
        <AppshotPermissionsPanel />
      </section>
    </main>
  );
}
