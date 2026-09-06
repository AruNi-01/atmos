"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PanelRight } from "lucide-react";
import { useCenterExplorerLayout } from "@/shared/stores/use-ui-pref-hooks";
import type { CenterExplorerKind } from "@/app-shell/center-explorer-layout";
import { panelFoldCursorClass } from "@/shared/lib/panel-fold";
import { cn } from "@/shared/lib/utils";

export function CenterExplorerToggle({
  kind,
  foldScopeId,
  className,
}: {
  kind: CenterExplorerKind;
  /**
   * Changes only: isolate fold prefs per DiffGroup / landing scope
   * (`changes` or `diff-group://…`).
   */
  foldScopeId?: string;
  className?: string;
}) {
  const t = useTranslations("appShell.centerExplorer");
  const [layout, { toggleCollapsed, changesForScope }] = useCenterExplorerLayout();
  const changesLayout =
    kind === "changes" && foldScopeId
      ? changesForScope(foldScopeId)
      : null;
  const collapsed =
    kind === "files"
      ? layout.filesCollapsed
      : (changesLayout?.collapsed ?? layout.changesCollapsed);
  const hideLabel = kind === "files" ? t("hideFiles") : t("hideChanges");
  const showLabel = kind === "files" ? t("showFiles") : t("showChanges");
  const label = collapsed ? showLabel : hideLabel;

  return (
    <button
      type="button"
      className={cn(className, panelFoldCursorClass("right", collapsed))}
      title={label}
      aria-label={label}
      aria-pressed={!collapsed}
      data-center-explorer-toggle={kind}
      data-center-explorer-fold-scope={
        kind === "changes" ? (foldScopeId ?? undefined) : undefined
      }
      onClick={() =>
        toggleCollapsed(kind, kind === "changes" ? foldScopeId : undefined)
      }
    >
      <PanelRight className="size-3.5" />
    </button>
  );
}
