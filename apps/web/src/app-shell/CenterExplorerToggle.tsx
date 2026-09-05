"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
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
