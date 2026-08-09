import type {
  Project,
  Workspace,
  WorkspaceLabel,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import { createTranslator } from "next-intl";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { SidebarGroupingMode } from "./workspace-status";
import { getWorkspaceWorkflowStatusMeta } from "./workspace-status";
import {
  WORKSPACE_PRIORITY_OPTIONS,
  WORKSPACE_PRIORITY_SORT_WEIGHT,
} from "./workspace-metadata-controls";

export type FlattenedWorkspaceEntry = {
  projectId: string;
  projectName: string;
  projectPath: string;
  workspace: Workspace;
};

export type WorkspaceGroup = {
  key: string;
  label: string;
  items: FlattenedWorkspaceEntry[];
  color?: string;
};

type WorkspaceTimeGroupKey = "today" | "yesterday" | "last_7_days" | "last_30_days" | "older";

export const UNTAGGED_WORKSPACE_GROUP_KEY = "__untagged__";

function createCachedWorkspaceTranslator(
  namespace: "appShell.workspaceGrouping" | "appShell.task",
) {
  let cachedLocale: "en" | "zh" | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cachedTranslator: any = null;

  return (key: string): string => {
    const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
    if (!cachedTranslator || cachedLocale !== locale) {
      cachedLocale = locale;
      cachedTranslator = createTranslator({
        locale,
        messages: locale === "zh" ? zhMessages : enMessages,
        namespace,
      });
    }
    return cachedTranslator(key as never);
  };
}

const workspaceGroupingT = createCachedWorkspaceTranslator(
  "appShell.workspaceGrouping",
);
const workspaceKanbanT = createCachedWorkspaceTranslator("appShell.task");

export function flattenProjectWorkspaces(projects: Project[]): FlattenedWorkspaceEntry[] {
  return projects.flatMap((project) =>
    project.workspaces.map((workspace) => ({
      projectId: project.id,
      projectName: project.name,
      projectPath: project.mainFilePath,
      workspace,
    })),
  );
}

function getRecencySource(workspace: Workspace): string {
  return workspace.lastVisitedAt ?? workspace.createdAt;
}

function getRecencyTimestamp(workspace: Workspace): number {
  const source = getRecencySource(workspace);
  return source ? new Date(source).getTime() : 0;
}

function startOfDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function getTimeGroupLabel(key: WorkspaceTimeGroupKey): string {
  return workspaceGroupingT(key);
}

function getTimeGroup(source: Date, now: Date): { key: WorkspaceTimeGroupKey; label: string } {
  const today = startOfDay(now).getTime();
  const sourceDay = startOfDay(source).getTime();
  const diffDays = Math.floor((today - sourceDay) / 86400000);

  if (diffDays <= 0) return { key: "today", label: getTimeGroupLabel("today") };
  if (diffDays === 1) return { key: "yesterday", label: getTimeGroupLabel("yesterday") };
  if (diffDays < 7) return { key: "last_7_days", label: getTimeGroupLabel("last_7_days") };
  if (diffDays < 30) return { key: "last_30_days", label: getTimeGroupLabel("last_30_days") };
  return { key: "older", label: getTimeGroupLabel("older") };
}

export function getWorkspaceTimeGroupLabel(workspace: Workspace, now = new Date()): string {
  return getTimeGroup(new Date(getRecencySource(workspace)), now).label;
}

export function getWorkspaceTimeGroupKey(workspace: Workspace, now = new Date()): string {
  return getTimeGroup(new Date(getRecencySource(workspace)), now).key;
}

function sortEntriesByRecency(items: FlattenedWorkspaceEntry[]): FlattenedWorkspaceEntry[] {
  return [...items].sort((a, b) => {
    const aPinned = a.workspace.isPinned ? 1 : 0;
    const bPinned = b.workspace.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return getRecencyTimestamp(b.workspace) - getRecencyTimestamp(a.workspace);
  });
}

function orderWorkspaceLabels(
  labels: WorkspaceLabel[],
  labelGroupOrder: string[],
): WorkspaceLabel[] {
  const labelsById = new Map<string, WorkspaceLabel>();
  for (const label of labels) {
    if (!labelsById.has(label.id)) {
      labelsById.set(label.id, label);
    }
  }

  const ordered: WorkspaceLabel[] = [];
  for (const labelId of labelGroupOrder) {
    const label = labelsById.get(labelId);
    if (!label) continue;
    ordered.push(label);
    labelsById.delete(labelId);
  }
  ordered.push(...labelsById.values());
  return ordered;
}

function getOrderedLabels(
  items: FlattenedWorkspaceEntry[],
  availableLabels: WorkspaceLabel[],
  labelGroupOrder: string[],
): WorkspaceLabel[] {
  return orderWorkspaceLabels(
    [
      ...availableLabels,
      ...items.flatMap((item) => item.workspace.labels),
    ],
    labelGroupOrder,
  );
}

export function getWorkspaceLabelGroupKey(
  workspace: Workspace,
  labelGroupOrder: string[],
  availableLabels: WorkspaceLabel[] = [],
): string {
  if (workspace.labels.length === 0) return UNTAGGED_WORKSPACE_GROUP_KEY;

  const workspaceLabelIds = new Set(workspace.labels.map((label) => label.id));
  return orderWorkspaceLabels(
    [...availableLabels, ...workspace.labels],
    labelGroupOrder,
  ).find((label) => workspaceLabelIds.has(label.id))?.id ?? workspace.labels[0].id;
}

export function groupWorkspaces(
  items: FlattenedWorkspaceEntry[],
  groupingMode: Exclude<SidebarGroupingMode, "project" | "group">,
  options: {
    availableLabels?: WorkspaceLabel[];
    labelGroupOrder?: string[];
  } = {},
): WorkspaceGroup[] {
  const sortedItems = sortEntriesByRecency(items);

  if (groupingMode === "status") {
    const STATUS_ORDER: WorkspaceWorkflowStatus[] = [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "completed",
      "canceled",
    ];

    const grouped = new Map<WorkspaceWorkflowStatus, FlattenedWorkspaceEntry[]>();

    for (const item of sortedItems) {
      const bucket = grouped.get(item.workspace.workflowStatus) ?? [];
      bucket.push(item);
      grouped.set(item.workspace.workflowStatus, bucket);
    }

    return STATUS_ORDER.map((status) => ({
      key: status,
      label: getWorkspaceWorkflowStatusMeta(status).label,
      items: grouped.get(status) ?? [],
    }));
  }

  if (groupingMode === "priority") {
    const grouped = new Map<string, FlattenedWorkspaceEntry[]>();
    for (const item of sortedItems) {
      const bucket = grouped.get(item.workspace.priority) ?? [];
      bucket.push(item);
      grouped.set(item.workspace.priority, bucket);
    }

    return [...WORKSPACE_PRIORITY_OPTIONS]
      .sort(
        (a, b) =>
          WORKSPACE_PRIORITY_SORT_WEIGHT[b.value] -
          WORKSPACE_PRIORITY_SORT_WEIGHT[a.value],
      )
      .map((priority) => ({
        key: priority.value,
        label: workspaceKanbanT(priority.labelKey),
        items: grouped.get(priority.value) ?? [],
      }));
  }

  if (groupingMode === "label") {
    const orderedLabels = getOrderedLabels(
      sortedItems,
      options.availableLabels ?? [],
      options.labelGroupOrder ?? [],
    );
    const groups = orderedLabels.map<WorkspaceGroup>((label) => ({
      key: label.id,
      label: label.name,
      color: label.color,
      items: [],
    }));
    const groupsById = new Map(groups.map((group) => [group.key, group]));
    const untaggedItems: FlattenedWorkspaceEntry[] = [];

    for (const item of sortedItems) {
      if (item.workspace.labels.length === 0) {
        untaggedItems.push(item);
        continue;
      }

      const seenLabelIds = new Set<string>();
      for (const label of item.workspace.labels) {
        if (seenLabelIds.has(label.id)) continue;
        seenLabelIds.add(label.id);
        groupsById.get(label.id)?.items.push(item);
      }
    }

    if (untaggedItems.length > 0) {
      groups.push({
        key: UNTAGGED_WORKSPACE_GROUP_KEY,
        label: workspaceGroupingT("untagged"),
        items: untaggedItems,
      });
    }
    return groups;
  }

  const now = new Date();
  const grouped = new Map<string, WorkspaceGroup>();

  for (const item of sortedItems) {
    const source = new Date(getRecencySource(item.workspace));
    const group = getTimeGroup(source, now);
    const existing = grouped.get(group.key);
    if (existing) {
      existing.items.push(item);
    } else {
      grouped.set(group.key, {
        key: group.key,
        label: group.label,
        items: [item],
      });
    }
  }

  return [
    "today",
    "yesterday",
    "last_7_days",
    "last_30_days",
    "older",
  ]
    .map((key) => grouped.get(key))
    .filter((group): group is WorkspaceGroup => !!group);
}
