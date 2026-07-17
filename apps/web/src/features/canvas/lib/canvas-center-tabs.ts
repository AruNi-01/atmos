import {
  FileCode2,
  GitCompare,
  GitPullRequest,
  Layers2,
  LayoutDashboard,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import type { ActionRun } from "@/features/github/components/ActionsPanel";

export const CANVAS_CENTER_OVERVIEW_TAB_ID = "overview";

export type CanvasCenterTab =
  | {
      id: typeof CANVAS_CENTER_OVERVIEW_TAB_ID;
      kind: "overview";
      title: string;
    }
  | {
      id: string;
      kind: "file";
      title: string;
      path: string;
      line?: number;
      column?: number;
      mode: "edit" | "preview";
    }
  | {
      id: string;
      kind: "changes-group";
      title: string;
      repoPath: string;
      groupPath: string;
      diffFilePath?: string;
      line?: number;
    }
  | {
      id: string;
      kind: "changes-file";
      title: string;
      repoPath: string;
      filePath: string;
      originalPath?: string;
    }
  | {
      id: string;
      kind: "review-group";
      title: string;
      groupPath: string;
      diffFilePath?: string;
      line?: number;
      reviewCommentGuid?: string;
      reviewMessageGuid?: string;
      reviewSessionGuid?: string;
      revisionGuid?: string;
    }
  | {
      id: string;
      kind: "review-file";
      title: string;
      repoPath: string;
      filePath: string;
      originalPath: string;
      reviewSessionGuid?: string;
      revisionGuid?: string;
    }
  | {
      id: string;
      kind: "github-pr";
      title: string;
      owner: string;
      repo: string;
      branch: string;
      prNumber: number;
      description?: string;
    }
  | {
      id: string;
      kind: "github-action";
      title: string;
      owner: string;
      repo: string;
      runId: number;
      /** Transient list payload; detail view re-fetches when missing. */
      run?: ActionRun | null;
      description?: string;
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type CanvasCenterTabDraft = DistributiveOmit<CanvasCenterTab, "id" | "title"> & {
  title?: string;
};

type CanvasCenterTabWithoutId = DistributiveOmit<CanvasCenterTab, "id">;

let cachedCanvasCenterTabsLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedCanvasCenterTabsTranslator: any = null;

function canvasCenterTabsT(key: string, values?: Record<string, string | number | Date>): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedCanvasCenterTabsTranslator || cachedCanvasCenterTabsLocale !== locale) {
    cachedCanvasCenterTabsLocale = locale;
    cachedCanvasCenterTabsTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "canvas.centerTabs",
    });
  }
  return cachedCanvasCenterTabsTranslator(key as never, values as never);
}

function omitUndefinedProperties<T extends Record<string, unknown>>(value: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }
  return next as T;
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts.at(-1) || trimmed || canvasCenterTabsT("untitled");
}

function defaultCanvasCenterTabTitle(tab: CanvasCenterTabDraft): string {
  switch (tab.kind) {
    case "overview":
      return canvasCenterTabsT("titles.overview");
    case "file":
      return basename(tab.path);
    case "changes-group":
    case "review-group":
      return basename(tab.groupPath);
    case "changes-file":
    case "review-file":
      return basename(tab.filePath);
    case "github-pr":
      return canvasCenterTabsT("titles.pullRequest", { number: tab.prNumber });
    case "github-action":
      return (
        tab.description ||
        tab.run?.workflowName ||
        canvasCenterTabsT("titles.actionRun", { number: tab.runId })
      );
  }
}

export function createCanvasCenterTabId(tab: CanvasCenterTabWithoutId): string {
  switch (tab.kind) {
    case "overview":
      return CANVAS_CENTER_OVERVIEW_TAB_ID;
    case "file":
      return `file:${tab.path}:${tab.line ?? 0}:${tab.column ?? 0}`;
    case "changes-group":
      return `changes-group:${tab.groupPath}`;
    case "changes-file":
      return `changes-file:${tab.filePath}`;
    case "review-group":
      return `review-group:${tab.groupPath}:${tab.revisionGuid ?? "current"}`;
    case "review-file":
      return `review-file:${tab.filePath}:${tab.revisionGuid ?? "current"}`;
    case "github-pr":
      return `github-pr:${tab.owner}/${tab.repo}#${tab.prNumber}`;
    case "github-action":
      return `github-action:${tab.owner}/${tab.repo}#${tab.runId}`;
  }
}

export function createCanvasCenterTab(tab: CanvasCenterTabDraft): CanvasCenterTab {
  const title = tab.title ?? defaultCanvasCenterTabTitle(tab);
  return {
    ...omitUndefinedProperties(tab as Record<string, unknown>),
    id: createCanvasCenterTabId({ ...tab, title } as CanvasCenterTabWithoutId),
    title,
  } as CanvasCenterTab;
}

export function createCanvasCenterOverviewTab(): CanvasCenterTab {
  return createCanvasCenterTab({ kind: "overview" });
}

export function ensureCanvasCenterOverviewTab(tabs: CanvasCenterTab[]): CanvasCenterTab[] {
  if (tabs.some((tab) => tab.kind === "overview")) {
    return tabs;
  }
  return [createCanvasCenterOverviewTab(), ...tabs];
}

export function upsertCanvasCenterTab(
  tabs: CanvasCenterTab[],
  nextTab: CanvasCenterTab,
): { tabs: CanvasCenterTab[]; activeTabId: string } {
  const sanitizedNextTab = omitUndefinedProperties(nextTab as unknown as Record<string, unknown>) as CanvasCenterTab;
  const existingIndex = tabs.findIndex((tab) => tab.id === sanitizedNextTab.id);
  if (existingIndex < 0) {
    return { tabs: [...tabs, sanitizedNextTab], activeTabId: sanitizedNextTab.id };
  }
  const nextTabs = tabs.slice();
  nextTabs[existingIndex] = omitUndefinedProperties({
    ...tabs[existingIndex]!,
    ...sanitizedNextTab,
  } as unknown as Record<string, unknown>) as CanvasCenterTab;
  return { tabs: nextTabs, activeTabId: sanitizedNextTab.id };
}

export function removeCanvasCenterTab(
  tabs: CanvasCenterTab[],
  tabId: string,
  activeTabId: string | null,
): { tabs: CanvasCenterTab[]; activeTabId: string | null } {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) {
    return { tabs, activeTabId };
  }
  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  if (activeTabId !== tabId) {
    return { tabs: nextTabs, activeTabId };
  }
  return {
    tabs: nextTabs,
    activeTabId: nextTabs[Math.max(0, index - 1)]?.id ?? nextTabs[0]?.id ?? null,
  };
}

export function getCanvasCenterTabIcon(tab: CanvasCenterTab): LucideIcon {
  switch (tab.kind) {
    case "overview":
      return LayoutDashboard;
    case "file":
      return FileCode2;
    case "changes-group":
      return Layers2;
    case "changes-file":
      return GitCompare;
    case "review-group":
    case "review-file":
    case "github-pr":
      return GitPullRequest;
    case "github-action":
      return Workflow;
  }
}

export function getCanvasCenterTabSubtitle(tab: CanvasCenterTab): string {
  switch (tab.kind) {
    case "overview":
      return canvasCenterTabsT("subtitles.overview");
    case "file":
      return tab.path;
    case "changes-group":
      return canvasCenterTabsT("subtitles.changedFiles");
    case "changes-file":
      return tab.filePath;
    case "review-group":
      return canvasCenterTabsT("subtitles.reviewDiff");
    case "review-file":
      return tab.filePath;
    case "github-pr":
      return tab.description || `${tab.owner}/${tab.repo}#${tab.prNumber}`;
    case "github-action":
      return tab.description || `${tab.owner}/${tab.repo}#${tab.runId}`;
  }
}
