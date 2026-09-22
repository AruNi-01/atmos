import type { GroupModel, ProjectModel, WorkspaceModel } from "@/api/types";

export const WORKSPACE_GROUPING_OPTIONS = [
  { value: "project", label: "By Project" },
  { value: "group", label: "By Group" },
  { value: "status", label: "By Status" },
  { value: "agent", label: "By Agent Status" },
  { value: "time", label: "By Time" },
  { value: "label", label: "By Label" },
  { value: "priority", label: "By Priority" },
] as const;

export type WorkspaceGrouping = (typeof WORKSPACE_GROUPING_OPTIONS)[number]["value"];

export type WorkspaceHomeFilters = {
  groupIds: string[];
  labelIds: string[];
  priorities: string[];
  projectIds: string[];
  showAutomation: boolean;
  statuses: string[];
};

export const EMPTY_WORKSPACE_HOME_FILTERS: WorkspaceHomeFilters = {
  groupIds: [],
  labelIds: [],
  priorities: [],
  projectIds: [],
  showAutomation: false,
  statuses: [],
};

export type WorkspaceHomeEntry = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
};

export type WorkspaceHomeSection = {
  key: string;
  title: string;
  items: WorkspaceHomeEntry[];
};

const STATUS_ORDER = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "canceled",
];

const PRIORITY_ORDER = ["no_priority", "urgent", "high", "medium", "low"];

const TIME_ORDER = ["today", "yesterday", "last_7_days", "last_30_days", "older"];

const UNGROUPED = "__ungrouped__";
const UNTAGGED = "__untagged__";

export function workspaceTitle(workspace: WorkspaceModel) {
  return workspace.display_name?.trim() || workspace.name;
}

function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recencyTimestamp(workspace: WorkspaceModel) {
  const source = workspace.last_visited_at || workspace.created_at;
  const value = Date.parse(source);
  return Number.isFinite(value) ? value : 0;
}

function timeKey(iso: string, now: number) {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "older";
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const age = start.getTime() - new Date(timestamp).setHours(0, 0, 0, 0);
  if (age <= 0) return "today";
  if (age <= day) return "yesterday";
  if (age <= 7 * day) return "last_7_days";
  if (age <= 30 * day) return "last_30_days";
  return "older";
}

function timeLabel(key: string) {
  if (key === "today") return "Today";
  if (key === "yesterday") return "Yesterday";
  if (key === "last_7_days") return "Last 7 days";
  if (key === "last_30_days") return "Last 30 days";
  return "Older";
}

function groupIdForWorkspace(groups: GroupModel[], projectId: string, workspaceId: string) {
  const match = groups.find((group) =>
    group.members.some(
      (member) =>
        (member.member_type === "workspace" && member.member_guid === workspaceId) ||
        (member.member_type === "project" && member.member_guid === projectId),
    ),
  );
  return match?.guid ?? null;
}

export function visibleWorkspaceEntries({
  filters,
  groups,
  projects,
  workspacesByProject,
}: {
  filters: WorkspaceHomeFilters;
  groups: GroupModel[];
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
}): WorkspaceHomeEntry[] {
  const projectName = new Map(projects.map((project) => [project.guid, project.name]));
  const entries: WorkspaceHomeEntry[] = [];

  for (const [projectId, workspaces] of Object.entries(workspacesByProject)) {
    for (const workspace of workspaces) {
      if (workspace.is_deleted || workspace.is_archived) continue;
      if (!filters.showAutomation && workspace.create_source === "automation") continue;
      if (filters.projectIds.length > 0 && !filters.projectIds.includes(projectId)) continue;
      if (filters.statuses.length > 0 && !filters.statuses.includes(workspace.workflow_status)) continue;
      if (filters.priorities.length > 0 && !filters.priorities.includes(workspace.priority)) continue;
      if (
        filters.labelIds.length > 0 &&
        !workspace.labels.some((label) => filters.labelIds.includes(label.guid))
      ) {
        continue;
      }
      if (filters.groupIds.length > 0) {
        const groupId = groupIdForWorkspace(groups, projectId, workspace.guid) ?? UNGROUPED;
        if (!filters.groupIds.includes(groupId)) continue;
      }
      entries.push({
        id: workspace.guid,
        projectId,
        projectName: projectName.get(projectId) ?? "Other",
        title: workspaceTitle(workspace),
      });
    }
  }

  return entries.sort((a, b) => a.title.localeCompare(b.title));
}

export function groupWorkspaceEntries({
  entries,
  grouping,
  groups,
  now = Date.now(),
  projects,
  workspacesByProject,
}: {
  entries: WorkspaceHomeEntry[];
  grouping: WorkspaceGrouping;
  groups: GroupModel[];
  now?: number;
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
}): WorkspaceHomeSection[] {
  const workspaceById = new Map(
    Object.values(workspacesByProject)
      .flat()
      .map((workspace) => [workspace.guid, workspace]),
  );
  const buckets = new Map<string, WorkspaceHomeSection>();

  const add = (key: string, title: string, entry: WorkspaceHomeEntry) => {
    const current = buckets.get(key) ?? { key, title, items: [] };
    current.items.push(entry);
    buckets.set(key, current);
  };

  for (const entry of entries) {
    const workspace = workspaceById.get(entry.id);
    if (!workspace) continue;
    if (grouping === "project") {
      add(entry.projectId, entry.projectName, entry);
    } else if (grouping === "group") {
      const groupId = groupIdForWorkspace(groups, entry.projectId, entry.id);
      const group = groups.find((item) => item.guid === groupId);
      add(group?.guid ?? UNGROUPED, group?.name ?? "Ungrouped", entry);
    } else if (grouping === "status") {
      add(workspace.workflow_status || "none", statusLabel(workspace.workflow_status || "No status"), entry);
    } else if (grouping === "agent") {
      add("idle", "Idle", entry);
    } else if (grouping === "time") {
      const key = timeKey(workspace.last_visited_at || workspace.created_at, now);
      add(key, timeLabel(key), entry);
    } else if (grouping === "priority") {
      add(workspace.priority || "none", statusLabel(workspace.priority || "None"), entry);
    } else if (workspace.labels.length === 0) {
      add(UNTAGGED, "Untagged", entry);
    } else {
      for (const label of workspace.labels) {
        add(label.guid, label.name, entry);
      }
    }
  }

  const orderIndex = (key: string) => {
    if (grouping === "project") {
      return projects.find((project) => project.guid === key)?.sidebar_order ?? Number.MAX_SAFE_INTEGER;
    }
    if (grouping === "group") {
      if (key === UNGROUPED) return Number.MAX_SAFE_INTEGER;
      return groups.find((group) => group.guid === key)?.sidebar_order ?? Number.MAX_SAFE_INTEGER;
    }
    if (grouping === "status") return STATUS_ORDER.indexOf(key);
    if (grouping === "priority") return PRIORITY_ORDER.indexOf(key);
    if (grouping === "time") return TIME_ORDER.indexOf(key);
    return 0;
  };

  return [...buckets.values()].sort((a, b) => {
    const left = orderIndex(a.key);
    const right = orderIndex(b.key);
    if (left !== right && left >= 0 && right >= 0) return left - right;
    return a.title.localeCompare(b.title);
  });
}

export function recentWorkspaceEntries({
  entries,
  limit = 5,
  workspacesByProject,
}: {
  entries: WorkspaceHomeEntry[];
  limit?: number;
  workspacesByProject: Record<string, WorkspaceModel[]>;
}) {
  const workspaceById = new Map(
    Object.values(workspacesByProject)
      .flat()
      .map((workspace) => [workspace.guid, workspace]),
  );
  return [...entries]
    .sort((a, b) => {
      const left = workspaceById.get(a.id);
      const right = workspaceById.get(b.id);
      return recencyTimestamp(right ?? left!) - recencyTimestamp(left ?? right!);
    })
    .filter((entry) => workspaceById.has(entry.id))
    .slice(0, limit);
}

export const WORKSPACE_STATUS_FILTER_OPTIONS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "in_review", label: "In Review" },
  { id: "blocked", label: "Blocked" },
  { id: "completed", label: "Completed" },
  { id: "canceled", label: "Canceled" },
] as const;

export const WORKSPACE_PRIORITY_FILTER_OPTIONS = [
  { id: "no_priority", label: "No priority" },
  { id: "urgent", label: "Urgent" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
] as const;

export type WorkspaceFilterKind = "group" | "label" | "priority" | "project" | "status";

export function workspaceFilterKey(kind: WorkspaceFilterKind) {
  if (kind === "project") return "projectIds" as const;
  if (kind === "group") return "groupIds" as const;
  if (kind === "status") return "statuses" as const;
  if (kind === "priority") return "priorities" as const;
  return "labelIds" as const;
}

/** "All", one name, or the first name plus how many more are selected. */
export function filterSelectionLabel(labels: string[]) {
  if (labels.length === 0) return "All";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1}`;
}

export function filterChoices({
  groups,
  kind,
  projects,
  workspacesByProject,
}: {
  groups: GroupModel[];
  kind: WorkspaceFilterKind;
  projects: ProjectModel[];
  workspacesByProject: Record<string, WorkspaceModel[]>;
}) {
  if (kind === "project") {
    return projects.map((project) => ({ id: project.guid, label: project.name }));
  }
  if (kind === "group") {
    return [
      { id: UNGROUPED, label: "Ungrouped" },
      ...groups.map((group) => ({ id: group.guid, label: group.name })),
    ];
  }
  if (kind === "status") return WORKSPACE_STATUS_FILTER_OPTIONS.map((option) => ({ ...option }));
  if (kind === "priority") return WORKSPACE_PRIORITY_FILTER_OPTIONS.map((option) => ({ ...option }));
  const workspaces = Object.values(workspacesByProject).flat();
  const labels = new Map<string, string>();
  for (const workspace of workspaces) {
    for (const label of workspace.labels) labels.set(label.guid, label.name);
  }
  return [...labels].map(([id, label]) => ({ id, label }));
}
