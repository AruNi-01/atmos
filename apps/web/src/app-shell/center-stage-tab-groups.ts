import type { TabGroupItem } from "@/app-shell/center-stage-tabs";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import type { OpenFile } from "@/features/editor/store/use-editor-store";

export type GroupedTabColumn = {
  key: string;
  label: string;
  tabs: TabGroupItem[];
};

/** Persist group order per pane so reordering pane A cannot reset pane B. */
export function paneScopedTabGroupKey(
  paneId: string | undefined,
  groupKey: string,
): string {
  return paneId ? `pane:${paneId}:${groupKey}` : groupKey;
}

export function readPaneTabGroupOrder(
  contextOrder: Record<string, string[] | undefined> | undefined,
  paneId: string | undefined,
  groupKey: string,
): string[] | undefined {
  if (paneId) {
    const scoped = contextOrder?.[paneScopedTabGroupKey(paneId, groupKey)];
    if (scoped && scoped.length > 0) return scoped;
  }
  return contextOrder?.[groupKey];
}

/** Keep only tabs owned by one center pane. */
export function filterGroupedTabItemsByAllowedIds(
  groups: readonly GroupedTabColumn[],
  allowedIds?: ReadonlySet<string> | null,
): GroupedTabColumn[] {
  if (!allowedIds) return groups.map((group) => ({ ...group, tabs: [...group.tabs] }));
  return groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => allowedIds.has(tab.value)),
    }))
    .filter((group) => group.tabs.length > 0);
}

export function collectDiffGroupTabs(
  openFiles: OpenFile[],
  extras?: {
    gitHistory?: { visible: boolean; label: string };
    changes?: { visible: boolean; label: string };
  },
): TabGroupItem[] {
  const diffTabs: TabGroupItem[] = openFiles
    .filter((file) => isDiffGroupEditorPath(file.path))
    .map((file) => ({
      id: file.path,
      label: file.name,
      value: file.path,
      kind: "diff-group" as const,
      file,
    }))
    .sort(
      (left, right) =>
        (left.file?.lastOpenedAt ?? 0) - (right.file?.lastOpenedAt ?? 0),
    );

  if (extras?.gitHistory?.visible) {
    diffTabs.unshift({
      id: "git-history",
      label: extras.gitHistory.label,
      value: "git-history",
      kind: "git-history",
    });
  }

  if (extras?.changes?.visible) {
    diffTabs.unshift({
      id: "changes",
      label: extras.changes.label,
      value: "changes",
      kind: "changes",
    });
  }

  return diffTabs;
}
