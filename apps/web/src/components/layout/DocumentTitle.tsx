"use client";

import { useEffect } from "react";
import { useContextParams } from "@/hooks/use-context-params";
import { useProjectStore } from "@/hooks/use-project-store";

/**
 * Client-side document title updater.
 * Reads project/workspace names from the store and sets document.title accordingly.
 * Renders nothing — purely a side-effect component.
 */
export function DocumentTitle() {
  const { workspaceId, projectId, currentView, skillId } = useContextParams();
  const projects = useProjectStore(s => s.projects);

  const derivedTitle = (() => {
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
          return "Workspaces – ATMOS";
        case "skills":
          return skillId ? `${skillId} – Skills – ATMOS` : "Skills – ATMOS";
        case "terminals":
          return "Terminals – ATMOS";
      }
    }
    return "ATMOS";
  })();

  useEffect(() => {
    document.title = derivedTitle;
  }, [derivedTitle]);

  return null;
}
