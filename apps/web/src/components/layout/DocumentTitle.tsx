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
  const { projects } = useProjectStore();

  useEffect(() => {
    let title = "ATMOS";

    if (workspaceId) {
      for (const project of projects) {
        const workspace = project.workspaces.find((w) => w.id === workspaceId);
        if (workspace) {
          title = `${workspace.branch || workspace.name} · ${project.name} – ATMOS`;
          break;
        }
      }
    } else if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        title = `${project.name} – ATMOS`;
      }
    } else {
      switch (currentView) {
        case "workspaces":
          title = "Workspaces – ATMOS";
          break;
        case "skills":
          title = skillId ? `${skillId} – Skills – ATMOS` : "Skills – ATMOS";
          break;
        case "terminals":
          title = "Terminals – ATMOS";
          break;
      }
    }

    document.title = title;
  }, [workspaceId, projectId, currentView, skillId, projects]);

  return null;
}
