import { createTranslator } from "next-intl";
import type { AgentSessionStatusSnapshot } from "@atmos/api-types/ws/dto/agent-status";
import type {
  Group,
  Project,
  Workspace,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import {
  findGroupIdForMember,
  UNGROUPED_USER_GROUP_KEY,
} from "@/app-shell/sidebar/user-groups";
import {
  SIDEBAR_TIME_GROUP_KEYS,
  sidebarTimeGroupKey,
  type SidebarTimeGroupKey,
} from "@/app-shell/sidebar/sidebar-time";
import { isStandaloneSidebarJob, isStandaloneAutomationProject } from "@/features/automations/lib/standalone-sidebar";
import {
  WORKSPACE_AGENT_GROUP_ORDER,
  type WorkspaceAgentGroupKey,
} from "@/features/agent/lib/workspace-agent-status";

type SidebarGroupingMode =
  | "project"
  | "group"
  | "status"
  | "agent"
  | "time"
  | "label"
  | "priority";

export { parseSidebarListView, type SidebarListView } from "@/app-shell/sidebar/sidebar-list-view";

/** Matches `NO_STATUS_WORKSPACE_GROUP_KEY` / `UNTAGGED_WORKSPACE_GROUP_KEY`. */
const NO_STATUS_KEY = "__no_status__";
const UNTAGGED_KEY = "__untagged__";
const UNKNOWN_PROJECT_KEY = "__unknown_project__";

const WORKFLOW_STATUSES: WorkspaceWorkflowStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "canceled",
];

const STATUS_LABEL_KEY: Record<string, string> = {
  backlog: "status.backlog",
  todo: "status.todo",
  in_progress: "status.inProgress",
  in_review: "status.inReview",
  blocked: "status.blocked",
  completed: "status.completed",
  canceled: "status.canceled",
  [NO_STATUS_KEY]: "status.noStatus",
};

const PRIORITY_ORDER: WorkspacePriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "no_priority",
];

const PRIORITY_LABEL_KEY: Record<WorkspacePriority, string> = {
  no_priority: "priority.noPriority",
  urgent: "priority.urgent",
  high: "priority.high",
  medium: "priority.medium",
  low: "priority.low",
};

const AGENT_LABEL_KEY: Record<WorkspaceAgentGroupKey, string> = {
  permission: "agent_permission",
  attention: "agent_attention",
  running: "agent_running",
  done: "agent_done",
};

const PRIORITY_VALUES = new Set<string>(PRIORITY_ORDER);

export type SidebarSessionFilters = {
  statuses: readonly string[];
  priorities: readonly string[];
  labelIds: readonly string[];
  projectIds: readonly string[];
  groupIds: readonly string[];
  showAutomationWorkspaces: boolean;
};

export type SidebarSessionRow = {
  sessionId: string;
  contextId: string | null;
  surface: AgentSessionStatusSnapshot["surface"];
  surfaceId: string | null;
  tool: AgentSessionStatusSnapshot["tool"];
  groupKey: WorkspaceAgentGroupKey;
  updatedAt: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  projectPath: string | null;
  workspaceName: string | null;
  branch: string | null;
  workspace: Workspace | null;
};

export type SidebarSessionGroup = {
  key: string;
  label: string;
  color?: string;
  items: SidebarSessionRow[];
};

export type SessionGroupingOptions = {
  groups?: Group[];
  availableLabels?: WorkspaceLabel[];
  labelGroupOrder?: string[];
  ungroupedLabel?: string;
  unknownProjectLabel?: string;
};

function createCachedTranslator(namespace: "appShell.workspaceGrouping" | "appShell.task") {
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

const groupingT = createCachedTranslator("appShell.workspaceGrouping");
const taskT = createCachedTranslator("appShell.task");

export function terminalSessionTitle(sessionId: string): string {
  const colon = sessionId.indexOf(":");
  if (colon < 0) return sessionId;
  const windowName = sessionId.slice(colon + 1).trim();
  return windowName || sessionId;
}

export function sessionChatId(snapshot: Pick<
  AgentSessionStatusSnapshot,
  "session_id" | "surface_id"
>): string | null {
  const surfaceId = snapshot.surface_id?.trim();
  if (surfaceId) return surfaceId;
  if (!snapshot.session_id.startsWith("chat:")) return null;
  const id = snapshot.session_id.slice("chat:".length).trim();
  return id || null;
}

export function sessionRowTitle(
  snapshot: Pick<
    AgentSessionStatusSnapshot,
    "session_id" | "surface" | "surface_id" | "tool"
  >,
  chatTitles: Readonly<Record<string, string>> = {},
): string {
  if (snapshot.surface === "chat") {
    const chatId = sessionChatId(snapshot);
    const titled = chatId ? chatTitles[chatId]?.trim() : "";
    if (titled) return titled;
    const tool = snapshot.tool?.trim();
    if (tool) return tool;
    return snapshot.session_id;
  }
  return terminalSessionTitle(snapshot.session_id);
}

export function formatSessionRowSubtitle(parts: {
  projectName?: string | null;
  workspaceName?: string | null;
  branch?: string | null;
  prState?: string | null;
}): string {
  return [parts.projectName, parts.workspaceName, parts.branch, parts.prState]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" · ");
}

function workspaceDisplayName(workspace: Workspace): string {
  const display = workspace.displayName?.trim();
  if (display) return display;
  return workspace.name.trim();
}

function indexProjects(projects: readonly Project[]) {
  const workspaceById = new Map<string, { project: Project; workspace: Workspace }>();
  const projectById = new Map<string, Project>();
  for (const project of projects) {
    projectById.set(project.id, project);
    for (const workspace of project.workspaces) {
      workspaceById.set(workspace.id, { project, workspace });
    }
  }
  return { workspaceById, projectById };
}

export function buildSidebarSessionRows(input: {
  snapshots: readonly AgentSessionStatusSnapshot[];
  projects: readonly Project[];
  chatTitles?: Readonly<Record<string, string>>;
}): SidebarSessionRow[] {
  const { workspaceById, projectById } = indexProjects(input.projects);
  const rows: SidebarSessionRow[] = [];

  for (const snapshot of input.snapshots) {
    const contextId = snapshot.context_id?.trim() || null;
    const located = contextId ? workspaceById.get(contextId) : undefined;
    if (located?.workspace.isArchived) continue;

    const project = located?.project ?? (contextId ? projectById.get(contextId) : undefined);
    const workspace = located?.workspace ?? null;
    rows.push({
      sessionId: snapshot.session_id,
      contextId,
      surface: snapshot.surface,
      surfaceId: snapshot.surface_id,
      tool: snapshot.tool,
      groupKey: snapshot.group_key,
      updatedAt: snapshot.updated_at,
      title: sessionRowTitle(snapshot, input.chatTitles),
      projectId: project?.id ?? workspace?.projectId ?? null,
      projectName: project?.name?.trim() || null,
      projectPath: project?.mainFilePath ?? snapshot.project_path,
      workspaceName: workspace ? workspaceDisplayName(workspace) : null,
      branch: workspace?.branch?.trim() || null,
      workspace,
    });
  }

  return rows;
}

function hasDimensionFilters(filters: SidebarSessionFilters): boolean {
  return (
    filters.statuses.length +
      filters.priorities.length +
      filters.labelIds.length +
      filters.projectIds.length +
      filters.groupIds.length >
    0
  );
}

function membershipKey(row: SidebarSessionRow, groups: Group[]): string {
  if (row.workspace && row.projectId) {
    return (
      findGroupIdForMember(groups, "workspace", row.workspace.id) ??
      findGroupIdForMember(groups, "project", row.projectId) ??
      UNGROUPED_USER_GROUP_KEY
    );
  }
  if (row.projectId) {
    return findGroupIdForMember(groups, "project", row.projectId) ?? UNGROUPED_USER_GROUP_KEY;
  }
  return UNGROUPED_USER_GROUP_KEY;
}

/**
 * Same workspace dimensions as `filterWorkspaceKanbanEntries`: project, group,
 * workflow status, priority, labels, and the automation-workspace toggle.
 */
function workspacePassesFilters(
  projectId: string,
  workspace: Workspace,
  filters: SidebarSessionFilters,
  groups: Group[],
): boolean {
  if (
    !filters.showAutomationWorkspaces &&
    workspace.createSource === "automation" &&
    !isStandaloneSidebarJob(projectId, workspace.id)
  ) {
    return false;
  }
  if (filters.projectIds.length > 0 && !filters.projectIds.includes(projectId)) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(workspace.workflowStatus)) {
    return false;
  }
  if (filters.priorities.length > 0 && !filters.priorities.includes(workspace.priority)) {
    return false;
  }
  if (
    filters.labelIds.length > 0 &&
    !workspace.labels.some((label) => filters.labelIds.includes(label.id))
  ) {
    return false;
  }
  if (filters.groupIds.length > 0) {
    const groupId =
      findGroupIdForMember(groups, "workspace", workspace.id) ??
      findGroupIdForMember(groups, "project", projectId);
    const key = groupId ?? UNGROUPED_USER_GROUP_KEY;
    if (!filters.groupIds.includes(key)) return false;
  }
  return true;
}

export function filterSidebarSessions(
  rows: readonly SidebarSessionRow[],
  filters: SidebarSessionFilters,
  groups: Group[] = [],
): SidebarSessionRow[] {
  return rows.filter((row) => {
    if (row.workspace && row.projectId) {
      return workspacePassesFilters(row.projectId, row.workspace, filters, groups);
    }
    if (
      row.projectId &&
      !filters.showAutomationWorkspaces &&
      isStandaloneAutomationProject(row.projectId)
    ) {
      return false;
    }
    if (!row.projectId) return !hasDimensionFilters(filters);
    if (filters.projectIds.length > 0 && !filters.projectIds.includes(row.projectId)) {
      return false;
    }
    if (
      filters.statuses.length > 0 ||
      filters.priorities.length > 0 ||
      filters.labelIds.length > 0
    ) {
      return false;
    }
    if (filters.groupIds.length > 0) {
      const groupId = findGroupIdForMember(groups, "project", row.projectId);
      const key = groupId ?? UNGROUPED_USER_GROUP_KEY;
      if (!filters.groupIds.includes(key)) return false;
    }
    return true;
  });
}

function timestampOf(source: string): number {
  const value = new Date(source).getTime();
  return Number.isFinite(value) ? value : 0;
}

function byUpdatedDesc(a: SidebarSessionRow, b: SidebarSessionRow): number {
  return timestampOf(b.updatedAt) - timestampOf(a.updatedAt);
}

function pushBucket(
  buckets: Map<string, SidebarSessionRow[]>,
  key: string,
  row: SidebarSessionRow,
) {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(row);
  else buckets.set(key, [row]);
}

function groupsFromBuckets(
  buckets: Map<string, SidebarSessionRow[]>,
  keys: readonly string[],
  labelFor: (key: string) => string,
  colorFor?: (key: string) => string | undefined,
): SidebarSessionGroup[] {
  return keys.flatMap((key) => {
    const items = buckets.get(key);
    if (!items?.length) return [];
    return [{
      key,
      label: labelFor(key),
      color: colorFor?.(key),
      items,
    }];
  });
}

function orderLabels(labels: WorkspaceLabel[], labelGroupOrder: string[]): WorkspaceLabel[] {
  const labelsById = new Map<string, WorkspaceLabel>();
  for (const label of labels) {
    if (!labelsById.has(label.id)) labelsById.set(label.id, label);
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

function statusKey(workspace: Workspace | null): string {
  if (!workspace) return NO_STATUS_KEY;
  return (WORKFLOW_STATUSES as readonly string[]).includes(workspace.workflowStatus)
    ? workspace.workflowStatus
    : NO_STATUS_KEY;
}

function priorityKey(workspace: Workspace | null): WorkspacePriority {
  const value = workspace?.priority;
  if (typeof value === "string" && PRIORITY_VALUES.has(value)) return value as WorkspacePriority;
  return "no_priority";
}

function timeLabel(key: SidebarTimeGroupKey): string {
  return groupingT(key);
}

export function groupSidebarSessions(
  rows: readonly SidebarSessionRow[],
  groupingMode: SidebarGroupingMode,
  options: SessionGroupingOptions = {},
): SidebarSessionGroup[] {
  const sorted = [...rows].sort(byUpdatedDesc);
  const groups = options.groups ?? [];
  const ungroupedLabel = options.ungroupedLabel ?? "Ungrouped";
  const unknownProjectLabel = options.unknownProjectLabel ?? "Unknown project";

  if (groupingMode === "agent") {
    const buckets = new Map<string, SidebarSessionRow[]>();
    for (const row of sorted) pushBucket(buckets, row.groupKey, row);
    return groupsFromBuckets(
      buckets,
      WORKSPACE_AGENT_GROUP_ORDER,
      (key) => groupingT(AGENT_LABEL_KEY[key as WorkspaceAgentGroupKey] ?? "agent_done"),
    );
  }

  if (groupingMode === "status") {
    const buckets = new Map<string, SidebarSessionRow[]>();
    for (const row of sorted) pushBucket(buckets, statusKey(row.workspace), row);
    return groupsFromBuckets(
      buckets,
      [...WORKFLOW_STATUSES, NO_STATUS_KEY],
      (key) => taskT(STATUS_LABEL_KEY[key] ?? "status.noStatus"),
    );
  }

  if (groupingMode === "priority") {
    const buckets = new Map<string, SidebarSessionRow[]>();
    for (const row of sorted) pushBucket(buckets, priorityKey(row.workspace), row);
    return groupsFromBuckets(
      buckets,
      PRIORITY_ORDER,
      (key) => taskT(PRIORITY_LABEL_KEY[key as WorkspacePriority]),
    );
  }

  if (groupingMode === "time") {
    const now = new Date();
    const buckets = new Map<string, SidebarSessionRow[]>();
    for (const row of sorted) {
      const date = new Date(row.updatedAt);
      const key = sidebarTimeGroupKey(Number.isFinite(date.getTime()) ? date : new Date(0), now);
      pushBucket(buckets, key, row);
    }
    return groupsFromBuckets(buckets, SIDEBAR_TIME_GROUP_KEYS, (key) => timeLabel(key as SidebarTimeGroupKey));
  }

  if (groupingMode === "label") {
    const labels = orderLabels(
      [
        ...(options.availableLabels ?? []),
        ...sorted.flatMap((row) => row.workspace?.labels ?? []),
      ],
      options.labelGroupOrder ?? [],
    );
    const buckets = new Map<string, SidebarSessionRow[]>();
    const untagged: SidebarSessionRow[] = [];
    const labelsById = new Map(labels.map((label) => [label.id, label]));
    for (const row of sorted) {
      const rowLabels = row.workspace?.labels ?? [];
      if (rowLabels.length === 0) {
        untagged.push(row);
        continue;
      }
      const seen = new Set<string>();
      let placed = false;
      for (const label of rowLabels) {
        if (seen.has(label.id)) continue;
        seen.add(label.id);
        if (!labelsById.has(label.id)) continue;
        pushBucket(buckets, label.id, row);
        placed = true;
      }
      if (!placed) untagged.push(row);
    }
    if (untagged.length > 0) buckets.set(UNTAGGED_KEY, untagged);
    return groupsFromBuckets(
      buckets,
      [...labels.map((label) => label.id), UNTAGGED_KEY],
      (key) => (key === UNTAGGED_KEY ? groupingT("untagged") : labelsById.get(key)?.name ?? key),
      (key) => labelsById.get(key)?.color,
    );
  }

  if (groupingMode === "group") {
    const buckets = new Map<string, SidebarSessionRow[]>();
    for (const row of sorted) pushBucket(buckets, membershipKey(row, groups), row);
    const named = [...groups]
      .sort((a, b) => a.sidebarOrder - b.sidebarOrder)
      .map((group) => group.id);
    const names = new Map(groups.map((group) => [group.id, group.name]));
    return groupsFromBuckets(
      buckets,
      [...named, UNGROUPED_USER_GROUP_KEY],
      (key) => (key === UNGROUPED_USER_GROUP_KEY ? ungroupedLabel : names.get(key) ?? key),
    );
  }

  const buckets = new Map<string, SidebarSessionRow[]>();
  const names = new Map<string, string>();
  for (const row of sorted) {
    const key = row.projectId ?? UNKNOWN_PROJECT_KEY;
    names.set(key, row.projectName || unknownProjectLabel);
    pushBucket(buckets, key, row);
  }
  const keys = [...buckets.entries()]
    .sort((a, b) => timestampOf(b[1][0]?.updatedAt ?? "") - timestampOf(a[1][0]?.updatedAt ?? ""))
    .map(([key]) => key);
  return groupsFromBuckets(buckets, keys, (key) => names.get(key) ?? unknownProjectLabel);
}
