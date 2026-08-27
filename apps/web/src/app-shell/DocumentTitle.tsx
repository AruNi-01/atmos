"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { isSettingsPathname } from "@/features/settings/lib/settings-return";

/**
 * Client-side document title updater.
 * Reads project/workspace names from the query cache and sets document.title accordingly.
 * Renders nothing — purely a side-effect component.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const { workspaceId, projectId, currentView, skillId } = useContextParams();
  const projects = useProjects();
  const t = useTranslations("appShell.documentTitle");

  const derivedTitle = (() => {
    // Settings route uses underlay context for shell, but the tab title stays Settings.
    if (isSettingsPathname(pathname)) {
      return t("settings");
    }
    if (workspaceId) {
      for (const project of projects) {
        const workspace = project.workspaces.find((w) => w.id === workspaceId);
        if (workspace) {
          return `${workspace.branch || workspace.name} · ${project.name} – ATMOS`;
        }
      }
    } else if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        return `${project.name} – ATMOS`;
      }
    } else {
      switch (currentView) {
        case "workspaces":
          return t("workspaces");
        case "skills":
          return skillId ? t("skillDetail", { skillId }) : t("skills");
        case "terminals":
          return t("terminals");
        case "automations":
          return t("automations");
        case "disk-analyzer":
          return t("diskAnalyzer");
        case "token-usage":
          return t("tokenUsage");
        case "agent-observer":
          return t("agentObserver");
        case "tasks":
          return t("tasks");
        case "pt-design":
          return t("ptDesign");
        case "settings":
          return t("settings");
      }
    }
    return t("app");
  })();

  useEffect(() => {
    document.title = derivedTitle;
  }, [derivedTitle]);

  return null;
}
