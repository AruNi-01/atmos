"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { arrayMove, type DragEndEvent } from "@workspace/ui";

import {
  EDITOR_REVIEW_DIFF_PREFIX,
  isConflictResolveEditorPath,
  isDiffEditorPath,
  isReviewGroupEditorPath,
  type OpenFile,
} from "@/features/editor/store/use-editor-store";
import {
  readCenterStageTabGroupOrder,
  writeCenterStageTabGroupOrder,
} from "@/shared/stores/use-ui-pref-hooks";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";
import type { BrowserCenterTab } from "@/features/browser/store/use-browser-center-tabs";
import {
  DEFAULT_PREVIEW_BROWSER_PREFS,
  getPreviewBrowserTabFaviconUrl,
  getPreviewBrowserTabLabel,
  type PreviewBrowserPrefs,
} from "@/features/browser/lib/browser-labels";
import {
  applySavedTabGroupOrder,
  type TabGroupItem,
  type TabGroupOrderByContext,
} from "@/app-shell/center-stage-tabs";

type TerminalGroupTab = {
  id: string;
  title: string;
  customTitle?: string;
};

/** Reorder group tabs only within each section (browser instance / terminal family). */
function applySectionedGroupOrder(
  group: { key: string; label: string; tabs: TabGroupItem[] },
  contextOrder: Record<string, string[] | undefined> | undefined,
  getSectionId: (tab: TabGroupItem) => string | undefined,
  sectionKeyPrefix: string,
) {
  const sections: TabGroupItem[][] = [];
  let currentSection: TabGroupItem[] = [];
  let currentSectionId: string | undefined;

  for (const tab of group.tabs) {
    const sectionId = getSectionId(tab);
    if (sectionId !== currentSectionId) {
      if (currentSection.length > 0) sections.push(currentSection);
      currentSection = [tab];
      currentSectionId = sectionId;
    } else {
      currentSection.push(tab);
    }
  }
  if (currentSection.length > 0) sections.push(currentSection);

  const orderedTabs = sections.flatMap((section, sectionIndex) => {
    const sectionId = getSectionId(section[0]!);
    const orderKey = sectionId ? `${sectionKeyPrefix}:${sectionId}` : undefined;
    const orderedSection = orderKey
      ? applySavedTabGroupOrder(
          { key: orderKey, label: group.label, tabs: section },
          contextOrder?.[orderKey],
        ).tabs
      : section;

    return orderedSection.map((tab, tabIndex) => ({
      ...tab,
      separatorBefore: sectionIndex > 0 && tabIndex === 0,
    }));
  });

  return {
    ...group,
    tabs: orderedTabs,
  };
}

function applyBrowserGroupOrder(
  group: { key: string; label: string; tabs: TabGroupItem[] },
  contextOrder?: Record<string, string[] | undefined>,
) {
  return applySectionedGroupOrder(group, contextOrder, (tab) => tab.browserId, "browser-instance");
}

function applyTerminalGroupOrder(
  group: { key: string; label: string; tabs: TabGroupItem[] },
  contextOrder?: Record<string, string[] | undefined>,
) {
  return applySectionedGroupOrder(
    group,
    contextOrder,
    (tab) => tab.terminalSection ?? tab.kind,
    "terminal-section",
  );
}

function resolveSectionedColumnKey(activeGroupKey: string): {
  columnKey: string;
  sectionFilter: ((tab: TabGroupItem) => boolean) | null;
} {
  if (activeGroupKey.startsWith("browser-instance:")) {
    const browserInstanceId = activeGroupKey.slice("browser-instance:".length);
    return {
      columnKey: "browser",
      sectionFilter: (tab) => tab.browserId === browserInstanceId,
    };
  }

  if (activeGroupKey.startsWith("terminal-section:")) {
    const terminalSection = activeGroupKey.slice("terminal-section:".length);
    return {
      columnKey: "terminal",
      sectionFilter: (tab) => (tab.terminalSection ?? tab.kind) === terminalSection,
    };
  }

  return { columnKey: activeGroupKey, sectionFilter: null };
}

export function useCenterStageTabGroups({
  browserTabs,
  codeReviewTabVisible = false,
  effectiveContextId,
  githubTabs,
  openFiles,
  pinnedTabs = {},
  previewBrowserPrefs = DEFAULT_PREVIEW_BROWSER_PREFS,
  projectWikiTabVisible = false,
  terminalTabs = [],
}: {
  browserTabs: BrowserCenterTab[];
  codeReviewTabVisible?: boolean;
  effectiveContextId: string | null;
  githubTabs: GithubCenterTab[];
  openFiles: OpenFile[];
  /** Center-stage pin map (tab value → pinnedAt). */
  pinnedTabs?: Record<string, number>;
  previewBrowserPrefs?: PreviewBrowserPrefs;
  projectWikiTabVisible?: boolean;
  terminalTabs?: TerminalGroupTab[];
}) {
  const t = useTranslations("appShell.centerStageTabGroups");
  const tabBarT = useTranslations("appShell.centerStageTabBar");
  const browserFallbackLabel = t("browser.newTab");
  const [tabGroupOrderByContext, setTabGroupOrderByContext] =
    React.useState<TabGroupOrderByContext>(() => readCenterStageTabGroupOrder());

  const groupedTabItems = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }> = [];

    // Sort helper: group tabs by their openedAt timestamp (ascending — oldest first,
    // matching the flat tab-bar order).
    const byOpenedAt = (left: { openedAt: number }, right: { openedAt: number }) =>
      left.openedAt - right.openedAt;

    // Terminals first (matches the center tab bar). Regular terminals, Project Wiki,
    // and Code Review sit in one column with horizontal rules between families —
    // same pattern as browser instances.
    const terminalGroupTabs: TabGroupItem[] = [];
    terminalTabs.forEach((tab) => {
      terminalGroupTabs.push({
        id: tab.id,
        label: tab.customTitle || tab.title,
        value: tab.id,
        kind: "terminal",
        terminalSection: "regular",
        pinnedAt: pinnedTabs[tab.id],
      });
    });
    if (projectWikiTabVisible) {
      terminalGroupTabs.push({
        id: "project-wiki",
        label: tabBarT("projectWiki"),
        value: "project-wiki",
        kind: "project-wiki",
        terminalSection: "project-wiki",
        separatorBefore: terminalGroupTabs.length > 0,
        pinnedAt: pinnedTabs["project-wiki"],
      });
    }
    if (codeReviewTabVisible) {
      terminalGroupTabs.push({
        id: "code-review",
        label: tabBarT("codeReview"),
        value: "code-review",
        kind: "code-review",
        terminalSection: "code-review",
        separatorBefore: terminalGroupTabs.length > 0,
        pinnedAt: pinnedTabs["code-review"],
      });
    }
    if (terminalGroupTabs.length > 0) {
      groups.push({ key: "terminal", label: t("groups.terminal"), tabs: terminalGroupTabs });
    }

    // File tabs (regular editor files, not diffs / reviews / conflicts)
    const fileTabs: TabGroupItem[] = [];
    openFiles
      .filter((file) => !isDiffEditorPath(file.path) && !isConflictResolveEditorPath(file.path))
      .forEach((file) => {
        fileTabs.push({
          id: file.path,
          label: file.name,
          value: file.path,
          kind: "file" as const,
          file,
          pinnedAt: pinnedTabs[file.path],
        });
      });
    if (fileTabs.length > 0) {
      fileTabs.sort((a, b) => byOpenedAt(
        { openedAt: a.file!.lastOpenedAt },
        { openedAt: b.file!.lastOpenedAt },
      ));
      groups.push({ key: "file", label: t("groups.file"), tabs: fileTabs });
    }

    // Diff tabs
    const diffTabs: TabGroupItem[] = [];
    openFiles
      .filter((file) => isDiffGroupEditorPath(file.path))
      .forEach((file) => {
        diffTabs.push({
          id: file.path,
          label: file.name,
          value: file.path,
          kind: "diff-group" as const,
          file,
          pinnedAt: pinnedTabs[file.path],
        });
      });
    if (diffTabs.length > 0) {
      diffTabs.sort((a, b) => byOpenedAt(
        { openedAt: a.file!.lastOpenedAt },
        { openedAt: b.file!.lastOpenedAt },
      ));
      groups.push({ key: "diff", label: t("groups.diff"), tabs: diffTabs });
    }

    // Review tabs
    const reviewTabs: TabGroupItem[] = [];
    openFiles
      .filter((file) => file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX) || isReviewGroupEditorPath(file.path))
      .forEach((file) => {
        reviewTabs.push({
          id: file.path,
          label: file.name,
          value: file.path,
          kind: "review-diff" as const,
          file,
          pinnedAt: pinnedTabs[file.path],
        });
      });
    if (reviewTabs.length > 0) {
      reviewTabs.sort((a, b) => byOpenedAt(
        { openedAt: a.file!.lastOpenedAt },
        { openedAt: b.file!.lastOpenedAt },
      ));
      groups.push({ key: "review", label: t("groups.review"), tabs: reviewTabs });
    }

    // Conflict tabs
    const conflictTabs: TabGroupItem[] = [];
    openFiles
      .filter((file) => isConflictResolveEditorPath(file.path))
      .forEach((file) => {
        conflictTabs.push({
          id: file.path,
          label: file.name,
          value: file.path,
          kind: "conflict" as const,
          file,
          pinnedAt: pinnedTabs[file.path],
        });
      });
    if (conflictTabs.length > 0) {
      conflictTabs.sort((a, b) => byOpenedAt(
        { openedAt: a.file!.lastOpenedAt },
        { openedAt: b.file!.lastOpenedAt },
      ));
      groups.push({ key: "conflict", label: t("groups.conflict"), tabs: conflictTabs });
    }

    // GitHub tabs (PR and Action) — attach openedAt from the source tab for sorting
    const githubGroupTabs: Array<TabGroupItem & { openedAt: number }> = githubTabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      value: tab.value,
      kind: tab.kind,
      openedAt: tab.openedAt,
      pinnedAt: pinnedTabs[tab.value],
    }));
    if (githubGroupTabs.length > 0) {
      githubGroupTabs.sort(byOpenedAt);
      groups.push({ key: "github", label: t("groups.github"), tabs: githubGroupTabs });
    }

    // Browser: list every internal tab across all open browser instances.
    // Different browsers are separated by a horizontal rule in the popover.
    const orderedBrowsers = [...browserTabs].sort(byOpenedAt);
    const browserGroupTabs: TabGroupItem[] = [];
    orderedBrowsers.forEach((browser, browserIndex) => {
      const context = previewBrowserPrefs.byContext[browser.browserContextId];
      const internalTabs = context?.tabs?.length
        ? context.tabs
        : [{ id: `${browser.browserId}-placeholder`, url: "", activeUrl: "", title: "" }];

      internalTabs.forEach((tab, tabIndex) => {
        browserGroupTabs.push({
          id: `${browser.value}:tab:${tab.id}`,
          label: getPreviewBrowserTabLabel(tab, browserFallbackLabel),
          value: browser.value,
          kind: "browser",
          browserId: browser.browserId,
          browserTabId: tab.id,
          browserContextId: browser.browserContextId,
          faviconUrl: getPreviewBrowserTabFaviconUrl(tab),
          separatorBefore: browserIndex > 0 && tabIndex === 0,
          // Pin is per browser instance (center tab), not each internal page tab.
          pinnedAt: pinnedTabs[browser.value],
        });
      });
    });
    if (browserGroupTabs.length > 0) {
      groups.push({ key: "browser", label: t("groups.browser"), tabs: browserGroupTabs });
    }

    return groups;
  }, [
    browserFallbackLabel,
    browserTabs,
    codeReviewTabVisible,
    githubTabs,
    openFiles,
    pinnedTabs,
    previewBrowserPrefs,
    projectWikiTabVisible,
    t,
    tabBarT,
    terminalTabs,
  ]);

  const orderedGroupedTabItems = React.useMemo(() => {
    const contextOrder = effectiveContextId ? tabGroupOrderByContext[effectiveContextId] : undefined;
    return groupedTabItems.map((group) => {
      // Browser / terminal columns mix multiple families. Order is stored and
      // applied per section so tabs cannot be interleaved across separators.
      if (group.key === "browser") {
        return applyBrowserGroupOrder(group, contextOrder);
      }
      if (group.key === "terminal") {
        return applyTerminalGroupOrder(group, contextOrder);
      }
      return applySavedTabGroupOrder(group, contextOrder?.[group.key]);
    });
  }, [effectiveContextId, groupedTabItems, tabGroupOrderByContext]);

  const handleTabGroupDragEnd = React.useCallback((event: DragEndEvent) => {
    if (!effectiveContextId || !event.over || event.active.id === event.over.id) return;

    const activeGroupKey = event.active.data.current?.groupKey;
    const overGroupKey = event.over.data.current?.groupKey;
    if (typeof activeGroupKey !== "string" || activeGroupKey !== overGroupKey) return;

    // Cross-section drops share a column but use different groupKeys
    // (`browser-instance:<id>` / `terminal-section:<id>`). Same-key check above
    // already rejects those.
    const { columnKey, sectionFilter } = resolveSectionedColumnKey(activeGroupKey);
    const group = orderedGroupedTabItems.find((item) => item.key === columnKey);
    if (!group) return;

    const ids = sectionFilter
      ? group.tabs.filter(sectionFilter).map((tab) => tab.id)
      : group.tabs.map((tab) => tab.id);

    const oldIndex = ids.indexOf(String(event.active.id));
    const newIndex = ids.indexOf(String(event.over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextOrder = arrayMove(ids, oldIndex, newIndex);
    setTabGroupOrderByContext((current) => {
      const next: TabGroupOrderByContext = {
        ...current,
        [effectiveContextId]: {
          ...(current[effectiveContextId] ?? {}),
          [activeGroupKey]: nextOrder,
        },
      };
      writeCenterStageTabGroupOrder(next);
      return next;
    });
  }, [effectiveContextId, orderedGroupedTabItems]);

  return {
    handleTabGroupDragEnd,
    orderedGroupedTabItems,
  };
}
