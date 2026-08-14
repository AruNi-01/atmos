import type {
  Group,
  Project,
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import type { SidebarGroupingMode } from "@/app-shell/sidebar/workspace-status";
import {
  getWorkspaceAgentGroupMeta,
  getWorkspaceWorkflowStatusMeta,
  WORKSPACE_AGENT_GROUP_OPTIONS,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "@/app-shell/sidebar/workspace-status";
import type { WorkspaceAgentGroupKey } from "@/features/agent/lib/workspace-agent-status";
import {
  WORKSPACE_PRIORITY_OPTIONS,
  WORKSPACE_PRIORITY_SORT_WEIGHT,
} from "@/app-shell/sidebar/workspace-metadata-controls";
import {
  getWorkspaceTimeGroupKey,
  getWorkspaceTimeGroupLabel,
  getWorkspaceAgentGroupLabel,
  UNTAGGED_WORKSPACE_GROUP_KEY,
} from "@/app-shell/sidebar/workspace-grouping";
import { findGroupIdForMember, UNGROUPED_USER_GROUP_KEY } from "@/app-shell/sidebar/user-groups";
import { STATUS_COLOR_MAP } from "@/app-shell/sidebar/WorkspaceKanbanTypes";

export type KanbanBoardColumn = {
  key: string;
  /** Display label, or i18n key when `labelIsI18nKey` is true. */
  label: string;
  labelIsI18nKey: boolean;
  color: string;
  status?: WorkspaceWorkflowStatus;
  priority?: WorkspacePriority;
  /** Agent grouping column (live-derived, not drag-assignable). */
  agentGroup?: WorkspaceAgentGroupKey;
  /** null = ungrouped column. */
  groupId?: string | null;
  projectId?: string;
};

const NEUTRAL_COLUMN_COLOR = "#94a3b8";

/** Matches WORKSPACE_PRIORITY_OPTIONS text colors (Tailwind → hex for board tints). */
const PRIORITY_COLOR_MAP: Record<WorkspacePriority, string> = {
  no_priority: "#94a3b8", // muted
  urgent: "#ef4444", // red-500
  high: "#f97316", // orange-500
  medium: "#eab308", // yellow-500
  low: "#10b981", // emerald-500
};

const TIME_COLUMN_ORDER = ["today", "yesterday", "last_7_days", "last_30_days", "older"] as const;

/**
 * Soft column board tint. Uses color-mix so hex, rgb(), and rgba() all work
 * (appending "10" only works for 6-digit hex and is nearly invisible on dark UI).
 */
export function columnBackgroundTint(color: string | null | undefined, alphaPercent = 16): string {
  const base = resolveBoardColor(color);
  return `color-mix(in srgb, ${base} ${alphaPercent}%, transparent)`;
}

function parseCssColorToRgb(
  color: string,
): { r: number; g: number; b: number } | null {
  const raw = color.trim().toLowerCase().replace(/\s+/g, "");
  if (!raw || raw === "transparent" || raw === "black") {
    return raw === "black" ? { r: 0, g: 0, b: 0 } : null;
  }

  // Bare or # hex (3 / 6 / 8 digits)
  let hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = raw.match(/^rgba?\((\d+),(\d+),(\d+)/);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  return null;
}

/**
 * Same neutral used for "No label" when a color is missing, invalid, or too dark
 * to tint a dark board (e.g. #000 / near-black defaults that look pure black).
 */
export function resolveBoardColor(color: string | null | undefined): string {
  const trimmed = color?.trim() ?? "";
  if (!trimmed) return NEUTRAL_COLUMN_COLOR;

  // Normalize bare hex so color-mix / CSS always get a valid value.
  let candidate = trimmed;
  const withoutHash = trimmed.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(withoutHash)) {
    candidate = `#${withoutHash}`;
  }

  const rgb = parseCssColorToRgb(candidate);
  if (!rgb) {
    // Unparseable → treat as unset (same as No label).
    return NEUTRAL_COLUMN_COLOR;
  }

  // Average channel < ~40 ≈ near-black on dark UI; fall back to No label slate.
  const average = (rgb.r + rgb.g + rgb.b) / 3;
  if (average < 40) {
    return NEUTRAL_COLUMN_COLOR;
  }

  return candidate.startsWith("#") || candidate.startsWith("rgb")
    ? candidate
    : `#${withoutHash}`;
}

/** Effective group for a workspace: workspace membership wins, else project membership. */
export function resolveWorkspaceGroupId(
  groups: Group[],
  projectId: string,
  workspaceId: string,
): string | null {
  return (
    findGroupIdForMember(groups, "workspace", workspaceId) ??
    findGroupIdForMember(groups, "project", projectId)
  );
}

export function resolveWorkspaceGroupName(
  groups: Group[],
  projectId: string,
  workspaceId: string,
): string | null {
  const groupId = resolveWorkspaceGroupId(groups, projectId, workspaceId);
  if (!groupId) return null;
  return groups.find((item) => item.id === groupId)?.name ?? null;
}

export function buildKanbanBoardColumns(params: {
  groupingMode: SidebarGroupingMode;
  projects: Project[];
  groups: Group[];
  availableLabels: WorkspaceLabel[];
  ungroupedLabel: string;
  untaggedLabel: string;
}): KanbanBoardColumn[] {
  const { groupingMode, projects, groups, availableLabels, ungroupedLabel, untaggedLabel } = params;

  if (groupingMode === "agent") {
    return WORKSPACE_AGENT_GROUP_OPTIONS.map((option) => ({
      key: option.value,
      label: getWorkspaceAgentGroupLabel(option.value),
      labelIsI18nKey: false,
      color: option.color,
      agentGroup: option.value,
    }));
  }

  if (groupingMode === "status") {
    return WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((option) => ({
      key: option.value,
      label: option.labelKey,
      labelIsI18nKey: true,
      color: STATUS_COLOR_MAP[option.value],
      status: option.value,
    }));
  }

  if (groupingMode === "priority") {
    return [...WORKSPACE_PRIORITY_OPTIONS]
      .sort(
        (a, b) =>
          WORKSPACE_PRIORITY_SORT_WEIGHT[b.value] - WORKSPACE_PRIORITY_SORT_WEIGHT[a.value],
      )
      .map((option) => ({
        key: option.value,
        label: option.labelKey,
        labelIsI18nKey: true,
        color: PRIORITY_COLOR_MAP[option.value],
        priority: option.value,
      }));
  }

  if (groupingMode === "project") {
    return projects
      .slice()
      .sort((a, b) => a.sidebarOrder - b.sidebarOrder)
      .map((project) => ({
        key: project.id,
        label: project.name,
        labelIsI18nKey: false,
        // Prefer project border color when set (sidebar “Set color”).
        color: resolveBoardColor(project.borderColor),
        projectId: project.id,
      }));
  }

  if (groupingMode === "group") {
    // Groups have no stored color — assign a stable palette by sidebar order.
    const GROUP_PALETTE = [
      "#3b82f6", // blue
      "#a855f7", // purple
      "#22c55e", // green
      "#f97316", // orange
      "#06b6d4", // cyan
      "#ec4899", // pink
      "#eab308", // yellow
      "#6366f1", // indigo
    ] as const;
    const orderedGroups = groups.slice().sort((a, b) => a.sidebarOrder - b.sidebarOrder);
    const columns: KanbanBoardColumn[] = orderedGroups.map((group, index) => ({
      key: group.id,
      label: group.name,
      labelIsI18nKey: false,
      color: GROUP_PALETTE[index % GROUP_PALETTE.length],
      groupId: group.id,
    }));
    columns.push({
      key: UNGROUPED_USER_GROUP_KEY,
      label: ungroupedLabel,
      labelIsI18nKey: false,
      color: NEUTRAL_COLUMN_COLOR,
      groupId: null,
    });
    return columns;
  }

  if (groupingMode === "label") {
    const columns: KanbanBoardColumn[] = availableLabels.map((label) => ({
      key: label.id,
      label: label.name,
      labelIsI18nKey: false,
      // Missing / black → same slate as "No label" column.
      color: resolveBoardColor(label.color),
    }));
    columns.push({
      key: UNTAGGED_WORKSPACE_GROUP_KEY,
      label: untaggedLabel,
      labelIsI18nKey: false,
      color: NEUTRAL_COLUMN_COLOR,
    });
    return columns;
  }

  // time — labels localized via a synthetic workspace per bucket
  const TIME_COLOR_MAP: Record<(typeof TIME_COLUMN_ORDER)[number], string> = {
    today: "#3b82f6",
    yesterday: "#6366f1",
    last_7_days: "#8b5cf6",
    last_30_days: "#a855f7",
    older: "#94a3b8",
  };
  const now = Date.now();
  const offsets: Record<(typeof TIME_COLUMN_ORDER)[number], number> = {
    today: 0,
    yesterday: 24 * 60 * 60 * 1000,
    last_7_days: 3 * 24 * 60 * 60 * 1000,
    last_30_days: 14 * 24 * 60 * 60 * 1000,
    older: 60 * 24 * 60 * 60 * 1000,
  };
  return TIME_COLUMN_ORDER.map((key) => {
    const ts = new Date(now - offsets[key]).toISOString();
    return {
      key,
      label: getWorkspaceTimeGroupLabel({
        lastVisitedAt: ts,
        createdAt: ts,
      } as Workspace),
      labelIsI18nKey: false,
      color: TIME_COLOR_MAP[key],
    };
  });
}

/** One or more column keys (label mode can place a card in multiple columns). */
export function resolveKanbanColumnKeys(params: {
  groupingMode: SidebarGroupingMode;
  projectId: string;
  workspace: Workspace;
  groups: Group[];
  agentGroupKey?: WorkspaceAgentGroupKey;
}): string[] {
  const { groupingMode, projectId, workspace, groups, agentGroupKey } = params;

  if (groupingMode === "agent") return [agentGroupKey ?? "idle"];
  if (groupingMode === "status") return [workspace.workflowStatus];
  if (groupingMode === "priority") return [workspace.priority];
  if (groupingMode === "project") return [projectId];
  if (groupingMode === "group") {
    const groupId = resolveWorkspaceGroupId(groups, projectId, workspace.id);
    return [groupId ?? UNGROUPED_USER_GROUP_KEY];
  }
  if (groupingMode === "label") {
    if (workspace.labels.length === 0) return [UNTAGGED_WORKSPACE_GROUP_KEY];
    return workspace.labels.map((label) => label.id);
  }
  return [getWorkspaceTimeGroupKey(workspace)];
}

export function isKanbanDragAssignable(groupingMode: SidebarGroupingMode): boolean {
  return groupingMode === "status" || groupingMode === "priority" || groupingMode === "group";
}

export function getColumnStatusIconClass(column: KanbanBoardColumn): string | undefined {
  if (column.agentGroup) return getWorkspaceAgentGroupMeta(column.agentGroup).className;
  if (!column.status) return undefined;
  return getWorkspaceWorkflowStatusMeta(column.status).className;
}
