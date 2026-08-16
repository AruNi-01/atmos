import type { TabGroupItem } from "@/app-shell/center-stage-tabs";
import { isDiffGroupEditorPath } from "@/features/diff/lib/diff-editor-paths";
import type { OpenFile } from "@/features/editor/store/use-editor-store";

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
