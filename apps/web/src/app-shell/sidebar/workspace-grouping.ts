import type { Project, Workspace, WorkspaceWorkflowStatus } from "@/shared/types/domain";
import { createTranslator } from "next-intl";
import enMessages from "../../../messages/en.json";
import zhMessages from "../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { SidebarGroupingMode } from "./workspace-status";
import { getWorkspaceWorkflowStatusMeta } from "./workspace-status";

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
};

type WorkspaceTimeGroupKey = "today" | "yesterday" | "last_7_days" | "last_30_days" | "older";

let cachedWorkspaceGroupingLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedWorkspaceGroupingTranslator: any = null;

function workspaceGroupingT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedWorkspaceGroupingTranslator || cachedWorkspaceGroupingLocale !== locale) {
    cachedWorkspaceGroupingLocale = locale;
    cachedWorkspaceGroupingTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "appShell.workspaceGrouping",
    });
  }
  return cachedWorkspaceGroupingTranslator(key as never);
}

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

export function groupWorkspaces(
  items: FlattenedWorkspaceEntry[],
  groupingMode: Exclude<SidebarGroupingMode, "project">,
): WorkspaceGroup[] {
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

    for (const item of sortEntriesByRecency(items)) {
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

  const now = new Date();
  const grouped = new Map<string, WorkspaceGroup>();

  for (const item of sortEntriesByRecency(items)) {
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
