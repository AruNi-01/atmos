"use client";

import { usePathname, useSearchParams } from "next/navigation";

import {
  isSettingsPathname,
  resolveStoredSettingsReturnPath,
} from "@/features/settings/lib/settings-return";

export type CurrentView =
  | "welcome"
  | "workspace"
  | "project"
  | "workspaces"
  | "skills"
  | "terminals"
  | "agents"
  | "automations"
  | "disk-analyzer"
  | "token-usage"
  | "tasks"
  | "settings";

interface ContextParams {
  /** Workspace ID from query param ?id= on /workspace */
  workspaceId: string | null;
  /** Project ID from query param ?id= on /project */
  projectId: string | null;
  /** workspaceId ?? projectId — the effective context for CenterStage */
  effectiveContextId: string | null;
  /** Which top-level view is active (underlay view while Settings is open) */
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
 * Pure URL → context parser. Also used while Settings is open to reconstruct the
 * previous page under the push stack from the stored return path.
 */
export function parseContextParams(
  pathname: string,
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): ContextParams {
  const segments = pathname.split("/").filter(Boolean);
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
  if (firstSegment === "automations") return { ...EMPTY, currentView: "automations" };
  if (firstSegment === "disk-analyzer") return { ...EMPTY, currentView: "disk-analyzer" };
  if (firstSegment === "token-usage") return { ...EMPTY, currentView: "token-usage" };
  if (firstSegment === "tasks") return { ...EMPTY, currentView: "tasks" };
  if (firstSegment === "settings") return { ...EMPTY, currentView: "settings" };

  return { ...EMPTY, currentView: "welcome" };
}

function parseContextParamsFromHref(href: string): ContextParams | null {
  try {
    const url = new URL(href, "http://local.invalid");
    return parseContextParams(url.pathname, url.searchParams);
  } catch {
    return null;
  }
}

/**
 * Reads context from URL search params (for dynamic data) and pathname
 * (for view identification).
 *
 * While the location is `/settings`, shell chrome (sidebar / center stage) is
 * driven by the stored settings return path so the previous page stays mounted
 * under the Settings push animation — instead of collapsing to welcome.
 *
 * Route structure (inside `(app)/`):
 *   /                        → welcome
 *   /workspace?id=...        → workspace
 *   /project?id=...          → project
 *   /workspaces              → workspaces management
 *   /skills                  → skills list
 *   /skills?scope=...&skillId=... → skill detail
 *   /terminals               → terminals
 *   /agents                  → agents management
 *   /automations             → automations management
 *   /disk-analyzer           → disk analyzer
 *   /token-usage             → token usage dashboard
 *   /tasks                   → task surface
 *   /settings                → settings (shell uses return-path underlay)
 */
export function useContextParams(): ContextParams {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (isSettingsPathname(pathname)) {
    const returnPath = resolveStoredSettingsReturnPath();
    if (returnPath) {
      const underlay = parseContextParamsFromHref(returnPath);
      if (underlay && underlay.currentView !== "settings") {
        return underlay;
      }
    }
    // No return path (cold open on /settings) — neutral underlay.
    return { ...EMPTY, currentView: "welcome" };
  }

  return parseContextParams(pathname, searchParams);
}
