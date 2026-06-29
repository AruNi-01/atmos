import type { GitChangedFile } from '@/api/ws-api';
import { createTranslator } from 'next-intl';
import enMessages from '../../../../messages/en.json';
import zhMessages from '../../../../messages/zh.json';
import { currentAppLocale } from '@/shared/lib/current-app-locale';

export const EDITOR_DIFF_GROUP_PREFIX = 'diff-group://';

export type DiffChangeGroupKind =
  | 'staged'
  | 'unstaged'
  | 'untracked'
  | 'branch'
  | 'commit'
  | 'compared';
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
  get branch() {
    return diffT('diffGroup.branch');
  },
  get commit() {
    return diffT('diffGroup.commit');
  },
  get compared() {
    return diffT('diffGroup.compared');
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
  if (
    kind === 'staged' ||
    kind === 'unstaged' ||
    kind === 'untracked' ||
    kind === 'branch' ||
    kind === 'commit' ||
    kind === 'compared'
  ) {
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

export function getFilesForDiffGroup(
  kind: DiffChangeGroupKind,
  git: GitFilesForGroupInput,
): GitChangedFile[] {
  switch (kind) {
    case 'staged':
      return git.stagedFiles;
    case 'unstaged':
      return git.unstagedFiles;
    case 'untracked':
      return git.untrackedFiles;
    case 'branch':
    case 'commit':
    case 'compared':
      return git.compareRef ? git.compareFiles : [];
    default:
      return [];
  }
}
