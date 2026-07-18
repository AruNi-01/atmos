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
import type { BrowserCenterTab } from "@/features/run-preview/store/use-browser-center-tabs";
import {
  DEFAULT_PREVIEW_BROWSER_PREFS,
  getPreviewBrowserTabFaviconUrl,
  getPreviewBrowserTabLabel,
  type PreviewBrowserPrefs,
} from "@/features/run-preview/lib/preview-browser-labels";
import {
  applySavedTabGroupOrder,
  type TabGroupItem,
  type TabGroupOrderByContext,
} from "@/app-shell/center-stage-tabs";

/** Reorder browser group tabs only within each browser instance section. */
function applyBrowserGroupOrder(
  group: { key: string; label: string; tabs: TabGroupItem[] },
  contextOrder?: Record<string, string[] | undefined>,
) {
  const sections: TabGroupItem[][] = [];
  let currentSection: TabGroupItem[] = [];
  let currentBrowserId: string | undefined;

  for (const tab of group.tabs) {
    if (tab.browserId !== currentBrowserId) {
      if (currentSection.length > 0) sections.push(currentSection);
      currentSection = [tab];
      currentBrowserId = tab.browserId;
    } else {
      currentSection.push(tab);
    }
  }
  if (currentSection.length > 0) sections.push(currentSection);

  const orderedTabs = sections.flatMap((section, sectionIndex) => {
    const browserId = section[0]?.browserId;
    const orderedSection = browserId
      ? applySavedTabGroupOrder(
          { key: `browser-instance:${browserId}`, label: group.label, tabs: section },
          contextOrder?.[`browser-instance:${browserId}`],
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

export function useCenterStageTabGroups({
  browserTabs,
  effectiveContextId,
  githubTabs,
  openFiles,
  previewBrowserPrefs = DEFAULT_PREVIEW_BROWSER_PREFS,
}: {
  browserTabs: BrowserCenterTab[];
  effectiveContextId: string | null;
  githubTabs: GithubCenterTab[];
  openFiles: OpenFile[];
  previewBrowserPrefs?: PreviewBrowserPrefs;
}) {
  const t = useTranslations("appShell.centerStageTabGroups");
  const browserFallbackLabel = t("browser.newTab");
  const [tabGroupOrderByContext, setTabGroupOrderByContext] =
    React.useState<TabGroupOrderByContext>(() => readCenterStageTabGroupOrder());

  const groupedTabItems = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }> = [];

    // Sort helper: group tabs by their openedAt timestamp (ascending — oldest first,
    // matching the flat tab-bar order).
    const byOpenedAt = (left: { openedAt: number }, right: { openedAt: number }) =>
      left.openedAt - right.openedAt;

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
        });
      });
    });
    if (browserGroupTabs.length > 0) {
      groups.push({ key: "browser", label: t("groups.browser"), tabs: browserGroupTabs });
    }

    return groups;
  }, [browserFallbackLabel, browserTabs, githubTabs, openFiles, previewBrowserPrefs, t]);

  const orderedGroupedTabItems = React.useMemo(() => {
    const contextOrder = effectiveContextId ? tabGroupOrderByContext[effectiveContextId] : undefined;
    return groupedTabItems.map((group) => {
      // Browser column mixes multiple browser instances. Order is stored and
      // applied per instance so tabs cannot be interleaved across browsers.
      if (group.key === "browser") {
        return applyBrowserGroupOrder(group, contextOrder);
      }
      return applySavedTabGroupOrder(group, contextOrder?.[group.key]);
    });
  }, [effectiveContextId, groupedTabItems, tabGroupOrderByContext]);

  const handleTabGroupDragEnd = React.useCallback((event: DragEndEvent) => {
    if (!effectiveContextId || !event.over || event.active.id === event.over.id) return;

    const activeGroupKey = event.active.data.current?.groupKey;
    const overGroupKey = event.over.data.current?.groupKey;
    if (typeof activeGroupKey !== "string" || activeGroupKey !== overGroupKey) return;

    // Cross-browser drops share the Browser column but use different groupKeys
    // (`browser-instance:<id>`). Same-key check above already rejects those.
    const columnKey = activeGroupKey.startsWith("browser-instance:")
      ? "browser"
      : activeGroupKey;
    const group = orderedGroupedTabItems.find((item) => item.key === columnKey);
    if (!group) return;

    const browserInstanceId = activeGroupKey.startsWith("browser-instance:")
      ? activeGroupKey.slice("browser-instance:".length)
      : null;
    const ids = browserInstanceId
      ? group.tabs
          .filter((tab) => tab.browserId === browserInstanceId)
          .map((tab) => tab.id)
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
