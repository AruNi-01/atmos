import React from "react";
import { arrayMove, type DragEndEvent } from "@workspace/ui";

import {
  EDITOR_REVIEW_DIFF_PREFIX,
  isConflictResolveEditorPath,
  isDiffEditorPath,
  isReviewGroupEditorPath,
  type OpenFile,
} from "@/hooks/use-editor-store";
import {
  readCenterStageTabGroupOrder,
  writeCenterStageTabGroupOrder,
} from "@/hooks/use-ui-pref-hooks";
import { isDiffGroupEditorPath } from "@/lib/diff-editor-paths";
import {
  applySavedTabGroupOrder,
  type TabGroupItem,
  type TabGroupOrderByContext,
} from "@/components/layout/center-stage-tabs";

export function useCenterStageTabGroups({
  effectiveContextId,
  openFiles,
}: {
  effectiveContextId: string | null;
  openFiles: OpenFile[];
}) {
  const [tabGroupOrderByContext, setTabGroupOrderByContext] =
    React.useState<TabGroupOrderByContext>(() => readCenterStageTabGroupOrder());

  const groupedTabItems = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }> = [];

    const fileTabsGroup = openFiles
      .filter((file) => !isDiffEditorPath(file.path) && !isConflictResolveEditorPath(file.path))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "file" as const,
        file,
      }));
    if (fileTabsGroup.length > 0) {
      groups.push({ key: "file", label: "File", tabs: fileTabsGroup });
    }

    const diffTabsGroup = openFiles
      .filter((file) => isDiffGroupEditorPath(file.path))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "diff-group" as const,
        file,
      }));
    if (diffTabsGroup.length > 0) {
      groups.push({ key: "diff", label: "Diff", tabs: diffTabsGroup });
    }

    const reviewTabsGroup = openFiles
      .filter((file) => file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX) || isReviewGroupEditorPath(file.path))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "review-diff" as const,
        file,
      }));
    if (reviewTabsGroup.length > 0) {
      groups.push({ key: "review-diff", label: "Review", tabs: reviewTabsGroup });
    }

    const conflictTabsGroup = openFiles
      .filter((file) => isConflictResolveEditorPath(file.path))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "conflict" as const,
        file,
      }));
    if (conflictTabsGroup.length > 0) {
      groups.push({ key: "conflict", label: "Conflict Resolve", tabs: conflictTabsGroup });
    }

    return groups;
  }, [openFiles]);

  const orderedGroupedTabItems = React.useMemo(() => {
    const contextOrder = effectiveContextId ? tabGroupOrderByContext[effectiveContextId] : undefined;
    return groupedTabItems.map((group) => applySavedTabGroupOrder(group, contextOrder?.[group.key]));
  }, [effectiveContextId, groupedTabItems, tabGroupOrderByContext]);

  const handleTabGroupDragEnd = React.useCallback((event: DragEndEvent) => {
    if (!effectiveContextId || !event.over || event.active.id === event.over.id) return;

    const activeGroupKey = event.active.data.current?.groupKey;
    const overGroupKey = event.over.data.current?.groupKey;
    if (typeof activeGroupKey !== "string" || activeGroupKey !== overGroupKey) return;

    const group = orderedGroupedTabItems.find((item) => item.key === activeGroupKey);
    if (!group) return;

    const ids = group.tabs.map((tab) => tab.id);
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
