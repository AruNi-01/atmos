"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useCenterExplorerLayout } from "@/shared/stores/use-ui-pref-hooks";
import type { CenterExplorerKind } from "@/app-shell/center-explorer-layout";

export function CenterExplorerToggle({
  kind,
  className,
}: {
  kind: CenterExplorerKind;
  className?: string;
}) {
  const t = useTranslations("appShell.centerExplorer");
  const [layout, { toggleCollapsed }] = useCenterExplorerLayout();
  const collapsed = kind === "files" ? layout.filesCollapsed : layout.changesCollapsed;
  const hideLabel = kind === "files" ? t("hideFiles") : t("hideChanges");
  const showLabel = kind === "files" ? t("showFiles") : t("showChanges");
  const label = collapsed ? showLabel : hideLabel;

  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      aria-pressed={!collapsed}
      data-center-explorer-toggle={kind}
      onClick={() => toggleCollapsed(kind)}
    >
      {collapsed ? (
        <PanelRightOpen className="size-3.5" />
      ) : (
        <PanelRightClose className="size-3.5" />
      )}
    </button>
  );
}

export function CenterExplorerLanding({
  kind,
  className,
}: {
  kind: CenterExplorerKind;
  className?: string;
}) {
  const t = useTranslations("appShell.centerExplorer");
  const toolbarIconBtnClass =
    "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer select-none";

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <div className="flex shrink-0 items-center justify-end border-b border-border bg-background/50 px-2.5 py-1 backdrop-blur-sm">
        <CenterExplorerToggle kind={kind} className={toolbarIconBtnClass} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
        {kind === "files" ? t("selectFile") : t("selectChange")}
      </div>
    </div>
  );
}
