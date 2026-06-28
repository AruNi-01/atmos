import type { GitChangedFile } from '@/api/ws-api';
import { createTranslator } from 'next-intl';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { currentAppLocale } from '@/shared/lib/current-app-locale';

export const EDITOR_DIFF_GROUP_PREFIX = 'diff-group://';

export type DiffChangeGroupKind = 'staged' | 'unstaged' | 'untracked';
let cachedDiffLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedDiffTranslator: any = null;

function diffT(key: string): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedDiffTranslator || cachedDiffLocale !== locale) {
    cachedDiffLocale = locale;
    cachedDiffTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'Diff.chrome',
    });
  }
  return cachedDiffTranslator(key as never);
}

export const DIFF_GROUP_TAB_LABELS = {
  get staged() {
    return diffT('diffGroup.staged');
  },
  get unstaged() {
    return diffT('diffGroup.unstaged');
  },
  get untracked() {
    return diffT('diffGroup.untracked');
  },
} as Record<DiffChangeGroupKind, string>;

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
  return kind ? DIFF_GROUP_TAB_LABELS[kind] : diffT('diffGroup.changes');
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
      return git.untrackedFiles;
    default:
      return [];
  }
}
