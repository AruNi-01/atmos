/** Expand/collapse height transition for FileTreeBranch and locate-scroll wait. */
export const TREE_BRANCH_DURATION_MS = 240;

/**
 * File tree branch shell should open only when the folder is expanded and
 * nested rows exist. Lazy dirs stay closed until listDir/cache fills children
 * so we never flash an empty shell, then play the enter transition.
 */
export function isFileTreeBranchOpen(
  isExpanded: boolean,
  childCount: number,
): boolean {
  return isExpanded && childCount > 0;
}
