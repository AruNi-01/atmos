import type {
  Project,
  Workspace,
  WorkspaceLabel,
} from "@/shared/types/domain";
import { createTranslator } from "next-intl";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { SidebarGroupingMode } from "./workspace-status";
import {
  getProjectWorkflowStatus,
  getWorkspaceAgentGroupMeta,
  isWorkspaceWorkflowStatus,
  NO_STATUS_WORKSPACE_GROUP_KEY,
  WORKSPACE_WORKFLOW_STATUS_OPTIONS,
} from "./workspace-status";
import {
  parseWorkspaceAgentGroupKey,
  WORKSPACE_AGENT_GROUP_ORDER,
  type WorkspaceAgentGroupKey,
} from "@/features/agent/lib/workspace-agent-status";
import {
  parseWorkspacePriority,
  WORKSPACE_PRIORITY_OPTIONS,
  WORKSPACE_PRIORITY_SORT_WEIGHT,
} from "./workspace-metadata-controls";

export type FlattenedWorkspaceEntry = {
  kind?: "workspace";
  projectId: string;
  projectName: string;
  projectPath: string;
  workspace: Workspace;
};

export type FlattenedProjectEntry = {
  kind: "project";
  projectId: string;
  projectName: string;
  projectPath: string;
  project: Project;
};

export type FlattenedSidebarEntry = FlattenedWorkspaceEntry | FlattenedProjectEntry;

export type WorkspaceGroup = {
  key: string;
  label: string;
  items: FlattenedSidebarEntry[];
  color?: string;
};

export function isFlattenedProjectEntry(
  entry: FlattenedSidebarEntry,
): entry is FlattenedProjectEntry {
  return entry.kind === "project";
}

export function getSidebarEntryKey(entry: FlattenedSidebarEntry): string {
  return isFlattenedProjectEntry(entry) ? `project:${entry.projectId}` : entry.workspace.id;
}

type WorkspaceTimeGroupKey = "today" | "yesterday" | "last_7_days" | "last_30_days" | "older";

export const UNTAGGED_WORKSPACE_GROUP_KEY = "__untagged__";
export { NO_STATUS_WORKSPACE_GROUP_KEY };

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
      kind: "workspace" as const,
      projectId: project.id,
      projectName: project.name,
      projectPath: project.mainFilePath,
      workspace,
    })),
  );
}

export function flattenProjects(projects: Project[]): FlattenedProjectEntry[] {
  return projects.map((project) => ({
    kind: "project" as const,
    projectId: project.id,
    projectName: project.name,
    projectPath: project.mainFilePath,
    project,
  }));
}

/** Most recently visited (or created) workspace — used to bucket a project row. */
export function getProjectGroupingWorkspace(project: Project): Workspace | undefined {
  if (project.workspaces.length === 0) return undefined;
  return [...project.workspaces].sort(
    (a, b) => getRecencyTimestamp(b) - getRecencyTimestamp(a),
  )[0];
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

function getEntryRecencyTimestamp(entry: FlattenedSidebarEntry): number {
  if (isFlattenedProjectEntry(entry)) {
    const representative = getProjectGroupingWorkspace(entry.project);
    return representative ? getRecencyTimestamp(representative) : 0;
  }
  return getRecencyTimestamp(entry.workspace);
}

function getEntryLabels(entry: FlattenedSidebarEntry): WorkspaceLabel[] {
  if (isFlattenedProjectEntry(entry)) {
    return getProjectGroupingWorkspace(entry.project)?.labels ?? [];
  }
  return entry.workspace.labels;
}

function getEntryStatus(entry: FlattenedSidebarEntry): unknown {
  if (isFlattenedProjectEntry(entry)) {
    return getProjectWorkflowStatus(entry.project);
  }
  return entry.workspace.workflowStatus;
}

function getEntryPriority(entry: FlattenedSidebarEntry): unknown {
  if (isFlattenedProjectEntry(entry)) {
    return getProjectGroupingWorkspace(entry.project)?.priority ?? "no_priority";
  }
  return entry.workspace.priority;
}

function getEntryAgentGroupKey(
  entry: FlattenedSidebarEntry,
  agentGroupKeyByWorkspaceId?: Readonly<Record<string, WorkspaceAgentGroupKey>>,
): WorkspaceAgentGroupKey {
  if (isFlattenedProjectEntry(entry)) {
    const keys = [
      parseWorkspaceAgentGroupKey(agentGroupKeyByWorkspaceId?.[entry.projectId]),
      ...entry.project.workspaces.map((workspace) =>
        parseWorkspaceAgentGroupKey(agentGroupKeyByWorkspaceId?.[workspace.id]),
      ),
    ];
    for (const orderKey of WORKSPACE_AGENT_GROUP_ORDER) {
      if (keys.includes(orderKey)) return orderKey;
    }
    return "done";
  }
  return parseWorkspaceAgentGroupKey(agentGroupKeyByWorkspaceId?.[entry.workspace.id]);
}

function getEntryTimeSource(entry: FlattenedSidebarEntry): Date {
  if (isFlattenedProjectEntry(entry)) {
    const representative = getProjectGroupingWorkspace(entry.project);
    if (!representative) return new Date(0);
    return new Date(getRecencySource(representative));
  }
  return new Date(getRecencySource(entry.workspace));
}

function sortEntriesByRecency(items: FlattenedSidebarEntry[]): FlattenedSidebarEntry[] {
  return [...items].sort((a, b) => {
    const aPinned = !isFlattenedProjectEntry(a) && a.workspace.isPinned ? 1 : 0;
    const bPinned = !isFlattenedProjectEntry(b) && b.workspace.isPinned ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return getEntryRecencyTimestamp(b) - getEntryRecencyTimestamp(a);
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
  items: FlattenedSidebarEntry[],
  availableLabels: WorkspaceLabel[],
  labelGroupOrder: string[],
): WorkspaceLabel[] {
  return orderWorkspaceLabels(
    [
      ...availableLabels,
      ...items.flatMap((item) => getEntryLabels(item)),
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
  ).find((label) => workspaceLabelIds.has(label.id))?.id
    ?? workspace.labels[0]?.id
    ?? UNTAGGED_WORKSPACE_GROUP_KEY;
}

export function getWorkspaceStatusGroupKey(status: unknown): string {
  return isWorkspaceWorkflowStatus(status) ? status : NO_STATUS_WORKSPACE_GROUP_KEY;
}

export function getWorkspaceAgentGroupLabel(key: WorkspaceAgentGroupKey): string {
  return workspaceGroupingT(getWorkspaceAgentGroupMeta(key).groupingLabelKey);
}

export function getProjectSidebarGroupKey(
  project: Project,
  groupingMode: Exclude<SidebarGroupingMode, "project" | "group">,
  options: {
    availableLabels?: WorkspaceLabel[];
    labelGroupOrder?: string[];
    agentGroupKeyByWorkspaceId?: Readonly<Record<string, WorkspaceAgentGroupKey>>;
  } = {},
): string {
  const entry: FlattenedProjectEntry = {
    kind: "project",
    projectId: project.id,
    projectName: project.name,
    projectPath: project.mainFilePath,
    project,
  };
  if (groupingMode === "agent") {
    return getEntryAgentGroupKey(entry, options.agentGroupKeyByWorkspaceId);
  }
  if (groupingMode === "status") {
    return getWorkspaceStatusGroupKey(getEntryStatus(entry));
  }
  if (groupingMode === "priority") {
    return parseWorkspacePriority(getEntryPriority(entry));
  }
  if (groupingMode === "label") {
    const representative = getProjectGroupingWorkspace(project);
    if (!representative) return UNTAGGED_WORKSPACE_GROUP_KEY;
    return getWorkspaceLabelGroupKey(
      representative,
      options.labelGroupOrder ?? [],
      options.availableLabels ?? [],
    );
  }
  return getTimeGroup(getEntryTimeSource(entry), new Date()).key;
}

export function groupWorkspaces(
  items: FlattenedSidebarEntry[],
  groupingMode: Exclude<SidebarGroupingMode, "project" | "group">,
  options: {
    availableLabels?: WorkspaceLabel[];
    labelGroupOrder?: string[];
    agentGroupKeyByWorkspaceId?: Readonly<Record<string, WorkspaceAgentGroupKey>>;
  } = {},
): WorkspaceGroup[] {
  const sortedItems = sortEntriesByRecency(items);

  if (groupingMode === "agent") {
    const grouped = new Map<WorkspaceAgentGroupKey, FlattenedSidebarEntry[]>();
    for (const item of sortedItems) {
      const key = getEntryAgentGroupKey(item, options.agentGroupKeyByWorkspaceId);
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }

    return WORKSPACE_AGENT_GROUP_ORDER.map((key) => ({
      key,
      label: getWorkspaceAgentGroupLabel(key),
      items: grouped.get(key) ?? [],
    }));
  }

  if (groupingMode === "status") {
    const grouped = new Map<string, FlattenedSidebarEntry[]>();

    for (const item of sortedItems) {
      const key = getWorkspaceStatusGroupKey(getEntryStatus(item));
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }

    const statusGroups: WorkspaceGroup[] = WORKSPACE_WORKFLOW_STATUS_OPTIONS.map((status) => ({
      key: status.value,
      label: workspaceKanbanT(status.labelKey),
      items: grouped.get(status.value) ?? [],
    }));
    const noStatusItems = grouped.get(NO_STATUS_WORKSPACE_GROUP_KEY) ?? [];
    if (noStatusItems.length > 0) {
      statusGroups.push({
        key: NO_STATUS_WORKSPACE_GROUP_KEY,
        label: workspaceKanbanT("status.noStatus"),
        items: noStatusItems,
      });
    }
    return statusGroups;
  }

  if (groupingMode === "priority") {
    const grouped = new Map<string, FlattenedSidebarEntry[]>();
    for (const item of sortedItems) {
      const key = parseWorkspacePriority(getEntryPriority(item));
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
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
    const untaggedItems: FlattenedSidebarEntry[] = [];

    for (const item of sortedItems) {
      const labels = getEntryLabels(item);
      if (labels.length === 0) {
        untaggedItems.push(item);
        continue;
      }

      const seenLabelIds = new Set<string>();
      let placed = false;
      for (const label of labels) {
        if (seenLabelIds.has(label.id)) continue;
        seenLabelIds.add(label.id);
        const group = groupsById.get(label.id);
        if (!group) continue;
        group.items.push(item);
        placed = true;
      }
      if (!placed) untaggedItems.push(item);
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
    const group = getTimeGroup(getEntryTimeSource(item), now);
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
