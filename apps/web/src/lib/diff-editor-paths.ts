import type { GitChangedFile } from '@/api/ws-api';

export const EDITOR_DIFF_GROUP_PREFIX = 'diff-group://';

export type DiffChangeGroupKind = 'staged' | 'unstaged' | 'untracked';

export const DIFF_GROUP_TAB_LABELS: Record<DiffChangeGroupKind, string> = {
  staged: 'Staged',
  unstaged: 'Unstaged',
  untracked: 'Untracked',
};

export function buildDiffGroupPath(kind: DiffChangeGroupKind): string {
  return `${EDITOR_DIFF_GROUP_PREFIX}${kind}`;
}

export function isDiffGroupEditorPath(path: string): boolean {
  return path.startsWith(EDITOR_DIFF_GROUP_PREFIX);
}

export function getDiffGroupKind(path: string): DiffChangeGroupKind | null {
  if (!isDiffGroupEditorPath(path)) return null;
  const kind = path.slice(EDITOR_DIFF_GROUP_PREFIX.length) as DiffChangeGroupKind;
  if (kind === 'staged' || kind === 'unstaged' || kind === 'untracked') {
    return kind;
  }
  return null;
}

export function getDiffGroupTabLabel(path: string): string {
  const kind = getDiffGroupKind(path);
  return kind ? DIFF_GROUP_TAB_LABELS[kind] : 'Changes';
}

interface GitFilesForGroupInput {
  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles: GitChangedFile[];
  compareFiles: GitChangedFile[];
  compareRef: string | null;
}

function applyCompareStats(
  files: GitChangedFile[],
  compareStatsByPath: Map<string, GitChangedFile>,
): GitChangedFile[] {
  return files
    .filter((file) => compareStatsByPath.has(file.path))
    .map((file) => {
      const stats = compareStatsByPath.get(file.path);
      if (!stats) return file;
      return {
        ...file,
        additions: stats.additions ?? file.additions,
        deletions: stats.deletions ?? file.deletions,
      };
    });
}

export function getFilesForDiffGroup(
  kind: DiffChangeGroupKind,
  git: GitFilesForGroupInput,
): GitChangedFile[] {
  const compareStatsByPath = git.compareRef
    ? new Map(git.compareFiles.map((file) => [file.path, file]))
    : null;

  const pick = (files: GitChangedFile[]) =>
    compareStatsByPath ? applyCompareStats(files, compareStatsByPath) : files;

  switch (kind) {
    case 'staged':
      return pick(git.stagedFiles);
    case 'unstaged':
      return pick(git.unstagedFiles);
    case 'untracked':
      return git.compareRef ? [] : git.untrackedFiles;
    default:
      return [];
  }
}
