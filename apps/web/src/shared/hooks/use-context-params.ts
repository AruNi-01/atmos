"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";

export type CurrentView = "welcome" | "workspace" | "project" | "workspaces" | "skills" | "terminals" | "agents";

interface ContextParams {
  /** Workspace ID from query param ?id= on /workspace */
  workspaceId: string | null;
  /** Project ID from query param ?id= on /project */
  projectId: string | null;
  /** workspaceId ?? projectId — the effective context for CenterStage */
  effectiveContextId: string | null;
  /** Which top-level view is active */
  currentView: CurrentView;
  /** Skill scope from query param ?scope= on /skills */
  skillScope: string | null;
  /** Skill identifier from query param ?skillId= on /skills */
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
 * Reads context from URL search params (for dynamic data) and pathname
 * (for view identification).
 *
 * Route structure (inside `[locale]/(app)/`):
 *   /                        → welcome
 *   /workspace?id=...        → workspace
 *   /project?id=...          → project
 *   /workspaces              → workspaces management
 *   /skills                  → skills list
 *   /skills?scope=...&skillId=... → skill detail
 *   /terminals               → terminals
 *   /agents                  → agents management
 */
export function useContextParams(): ContextParams {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Strip locale prefix to get the clean path
  const locale = (params?.locale as string) || "";
  const path = locale ? pathname.replace(`/${locale}`, "") || "/" : pathname;

  // First segment determines the view
  const segments = path.split("/").filter(Boolean);
  const firstSegment = segments[0] || "";

  if (firstSegment === "workspace") {
    const id = searchParams.get("id");
    if (id) {
      return { ...EMPTY, workspaceId: id, effectiveContextId: id, currentView: "workspace" };
    }
    return { ...EMPTY, currentView: "welcome" };
  }

  if (firstSegment === "project") {
    const id = searchParams.get("id");
    if (id) {
      return { ...EMPTY, projectId: id, effectiveContextId: id, currentView: "project" };
    }
    return { ...EMPTY, currentView: "welcome" };
  }

  if (firstSegment === "skills") {
    const scope = searchParams.get("scope");
    const skillId = searchParams.get("skillId");
    if (scope && skillId) {
      return { ...EMPTY, currentView: "skills", skillScope: scope, skillId };
    }
    return { ...EMPTY, currentView: "skills" };
  }

  if (firstSegment === "workspaces") return { ...EMPTY, currentView: "workspaces" };
  if (firstSegment === "terminals") return { ...EMPTY, currentView: "terminals" };
  if (firstSegment === "agents") return { ...EMPTY, currentView: "agents" };

  return { ...EMPTY, currentView: "welcome" };
}
