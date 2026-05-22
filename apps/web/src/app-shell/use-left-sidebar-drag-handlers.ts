"use client";

import { useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@workspace/ui";
import {
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  arrayMove,
  sortableKeyboardCoordinates,
  useSensor,
  useSensors,
} from "@workspace/ui";
import type { Project, Workspace } from "@/shared/types/domain";
import type { FlattenedWorkspaceEntry } from "@/app-shell/sidebar/workspace-grouping";

interface UseLeftSidebarDragHandlersParams {
  activeKanbanFilterCount: number;
  filteredFlattenedWorkspaces: FlattenedWorkspaceEntry[];
  projects: Project[];
  reorderProjects: (projects: Project[]) => Promise<void>;
  reorderWorkspaces: (projectId: string, workspaces: Workspace[]) => Promise<void>;
}

export function useLeftSidebarDragHandlers({
  activeKanbanFilterCount,
  filteredFlattenedWorkspaces,
  projects,
  reorderProjects,
  reorderWorkspaces,
}: UseLeftSidebarDragHandlersParams) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const isAnyProjectDragging = activeId !== null && projects.some(p => p.id === activeId);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeProjectIndex = projects.findIndex((i) => i.id === active.id);
    const overProjectIndex = projects.findIndex((i) => i.id === over.id);

    if (activeProjectIndex !== -1 && overProjectIndex !== -1) {
      if (activeKanbanFilterCount > 0) return;
      const newProjects = arrayMove(projects, activeProjectIndex, overProjectIndex);
      await reorderProjects(newProjects);
      return;
    }

    for (const project of projects) {
      const activeWorkspaceIndex = project.workspaces.findIndex((w) => w.id === active.id);
      const overWorkspaceIndex = project.workspaces.findIndex((w) => w.id === over.id);

      if (activeWorkspaceIndex === -1 || overWorkspaceIndex === -1) continue;

      if (activeKanbanFilterCount > 0) {
        const visibleWorkspaceIds = new Set(
          filteredFlattenedWorkspaces
            .filter((entry) => entry.projectId === project.id)
            .map((entry) => entry.workspace.id),
        );
        const visibleWorkspacesInOrder = project.workspaces.filter((w) =>
          visibleWorkspaceIds.has(w.id)
        );
        const activeFilteredIndex = visibleWorkspacesInOrder.findIndex((w) => w.id === active.id);
        const overFilteredIndex = visibleWorkspacesInOrder.findIndex((w) => w.id === over.id);

        if (activeFilteredIndex === -1 || overFilteredIndex === -1) return;

        const reorderedVisibleWorkspaces = arrayMove(
          visibleWorkspacesInOrder,
          activeFilteredIndex,
          overFilteredIndex,
        );
        const newWorkspaces = project.workspaces.map((workspace) => {
          if (!visibleWorkspaceIds.has(workspace.id)) return workspace;
          return reorderedVisibleWorkspaces.shift() ?? workspace;
        });

        await reorderWorkspaces(project.id, newWorkspaces);
      } else {
        const newWorkspaces = arrayMove(project.workspaces, activeWorkspaceIndex, overWorkspaceIndex);
        await reorderWorkspaces(project.id, newWorkspaces);
      }
      return;
    }
  };

  return {
    activeId,
    handleDragEnd,
    handleDragStart,
    isAnyProjectDragging,
    sensors,
  };
}
