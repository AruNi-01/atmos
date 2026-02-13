"use client";

import { useParams, usePathname } from "next/navigation";

export type CurrentView = "welcome" | "workspace" | "project" | "workspaces" | "skills" | "terminals";

interface ContextParams {
  /** Workspace ID from route segment /workspace/[workspaceId] */
  workspaceId: string | null;
  /** Project ID from route segment /project/[projectId] */
  projectId: string | null;
  /** workspaceId ?? projectId — the effective context for CenterStage */
  effectiveContextId: string | null;
  /** Which top-level view is active */
  currentView: CurrentView;
  /** Skill scope from route segment /skills/[scope]/[skillId] */
  skillScope: string | null;
  /** Skill identifier from route segment /skills/[scope]/[skillId] (auto-decoded by Next.js) */
  skillId: string | null;
}

const EMPTY: Omit<ContextParams, "currentView"> = {
  workspaceId: null,
  projectId: null,
  effectiveContextId: null,
  skillScope: null,
  skillId: null,
};

/**
 * Reads context from Next.js route params (typed dynamic segments)
 * and pathname (for parameterless views).
 *
 * Route structure (inside `[locale]/(app)/`):
 *   /                              → welcome
 *   /workspace/[workspaceId]       → workspace
 *   /project/[projectId]           → project
 *   /workspaces                    → workspaces management
 *   /skills                        → skills list
 *   /skills/[scope]/[skillId]      → skill detail
 *   /terminals                     → terminals
 */
export function useContextParams(): ContextParams {
  const params = useParams();
  const pathname = usePathname();

  // --- Typed route params from Next.js dynamic segments ---
  const workspaceId = (params?.workspaceId as string) || null;
  const projectId = (params?.projectId as string) || null;
  const scope = (params?.scope as string) || null;
  const skillId = (params?.skillId as string) || null;

  // Routes WITH unique dynamic segments — params alone identify the view
  if (workspaceId) {
    return { ...EMPTY, workspaceId, effectiveContextId: workspaceId, currentView: "workspace" };
  }
  if (projectId) {
    return { ...EMPTY, projectId, effectiveContextId: projectId, currentView: "project" };
  }
  if (scope && skillId) {
    return { ...EMPTY, currentView: "skills", skillScope: scope, skillId };
  }

  // Routes WITHOUT unique params — use locale-aware pathname matching
  const locale = (params?.locale as string) || "";
  const path = locale ? pathname.replace(`/${locale}`, "") || "/" : pathname;

  if (path.startsWith("/workspaces")) return { ...EMPTY, currentView: "workspaces" };
  if (path.startsWith("/skills")) return { ...EMPTY, currentView: "skills" };
  if (path.startsWith("/terminals")) return { ...EMPTY, currentView: "terminals" };

  return { ...EMPTY, currentView: "welcome" };
}
