import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";

/** Keep in sync with `SIDEBAR_GROUPING_MODES` — listed here to avoid UI imports in tests. */
const GROUPING_MODES = [
  "project",
  "group",
  "status",
  "time",
  "label",
  "priority",
  "agent",
] as const satisfies readonly SidebarGroupingMode[];

function parseSavedGroupingMode(value: unknown): SidebarGroupingMode | null {
  return GROUPING_MODES.includes(value as SidebarGroupingMode)
    ? (value as SidebarGroupingMode)
    : null;
}

type FunctionSettingsSnapshot = {
  workspace_kanban_view?: unknown;
  workspace_sidebar?: unknown;
};

/**
 * Tasks board grouping only — do not read `workspace_sidebar.grouping_mode`.
 * Accepts `workspace_kanban_view.grouping_mode` or `state.grouping_mode`.
 */
export function parseWorkspaceKanbanGroupingMode(
  settings: FunctionSettingsSnapshot,
): SidebarGroupingMode | null {
  const section = settings.workspace_kanban_view;
  if (!section || typeof section !== "object") return null;
  const record = section as Record<string, unknown>;
  const sibling = parseSavedGroupingMode(record.grouping_mode);
  if (sibling) return sibling;
  const state =
    record.state && typeof record.state === "object"
      ? (record.state as Record<string, unknown>)
      : record;
  return parseSavedGroupingMode(state.grouping_mode);
}
