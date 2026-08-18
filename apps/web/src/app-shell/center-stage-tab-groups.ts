import type { TabGroupItem } from "@/app-shell/center-stage-tabs";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import type { OpenFile } from "@/features/editor/store/use-editor-store";

export type GroupedTabColumn = {
  key: string;
  label: string;
  tabs: TabGroupItem[];
};

/**
 * Keep only tabs owned by one center pane. Used so split panes do not share
 * the grouped-tab popover (each region lists its own surfaces).
 */
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
