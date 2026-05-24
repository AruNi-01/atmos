import { detectCodeLanguage } from '@/shared/lib/code-language';
import { getDiffGroupTabLabel, isDiffGroupEditorPath } from '@/features/diff/lib/diff-editor-paths';

/** @deprecated Per-file diff tabs — use `diff-group://` instead */
export const EDITOR_DIFF_PREFIX = 'diff://';
export const EDITOR_REVIEW_DIFF_PREFIX = 'review-diff://';
export const EDITOR_REVIEW_GROUP_PREFIX = 'review-group://';
export const EDITOR_CONFLICT_RESOLVE_PREFIX = 'git-conflict-resolve://';
export const EDITOR_CONFLICT_RESOLVE_ALL_PATH = `${EDITOR_CONFLICT_RESOLVE_PREFIX}merge-conflicts`;

export function isReviewGroupEditorPath(path: string): boolean {
  return path.startsWith(EDITOR_REVIEW_GROUP_PREFIX);
}

export function isGroupedDiffEditorPath(path: string): boolean {
  return isDiffGroupEditorPath(path) || isReviewGroupEditorPath(path);
}

export function isDiffEditorPath(path: string): boolean {
  return (
    path.startsWith(EDITOR_DIFF_PREFIX) ||
    isGroupedDiffEditorPath(path) ||
    path.startsWith(EDITOR_REVIEW_DIFF_PREFIX)
  );
}

export function isConflictResolveEditorPath(path: string): boolean {
  return path.startsWith(EDITOR_CONFLICT_RESOLVE_PREFIX);
}

export function getEditorSourcePath(path: string): string {
  if (path.startsWith(EDITOR_REVIEW_GROUP_PREFIX)) {
    return path.slice(EDITOR_REVIEW_GROUP_PREFIX.length);
  }

  if (path.startsWith(EDITOR_REVIEW_DIFF_PREFIX)) {
    const rest = path.slice(EDITOR_REVIEW_DIFF_PREFIX.length);
    const slashIdx = rest.indexOf('/');
    return slashIdx >= 0 ? rest.slice(slashIdx + 1) : rest;
  }

  if (path.startsWith(EDITOR_DIFF_PREFIX)) {
    return path.slice(EDITOR_DIFF_PREFIX.length);
  }

  if (isConflictResolveEditorPath(path)) {
    return path.slice(EDITOR_CONFLICT_RESOLVE_PREFIX.length);
  }

  return path;
}

export function getReviewDiffSnapshotGuid(path: string): string | null {
  if (!path.startsWith(EDITOR_REVIEW_DIFF_PREFIX)) return null;
  const rest = path.slice(EDITOR_REVIEW_DIFF_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  return slashIdx >= 0 ? rest.slice(0, slashIdx) : null;
}

export function getReviewGroupRevisionGuid(path: string): string | null {
  if (!path.startsWith(EDITOR_REVIEW_GROUP_PREFIX)) return null;
  const revisionGuid = path.slice(EDITOR_REVIEW_GROUP_PREFIX.length);
  return revisionGuid || null;
}

export function getLanguageFromPath(path: string): string {
  return detectCodeLanguage(getEditorSourcePath(path));
}

export function isBinaryFile(path: string): boolean {
    const ext = getEditorSourcePath(path).split('.').pop()?.toLowerCase();
    const binaryExts = [
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff',
        'pdf',
        'mp4', 'webm', 'ogg', 'mp3', 'wav',
        'zip', 'tar', 'gz', '7z', 'rar',
        // Office docs often need special handling, treat as binary for now
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
    ];
    return ext ? binaryExts.includes(ext) : false;
}

export function getFileNameFromPath(path: string): string {
  if (isReviewGroupEditorPath(path)) {
    return 'Review';
  }

  if (isDiffGroupEditorPath(path)) {
    return getDiffGroupTabLabel(path);
  }

  const sourcePath = getEditorSourcePath(path);
  const baseName = sourcePath.split('/').pop() || sourcePath;

  if (path.startsWith(EDITOR_REVIEW_DIFF_PREFIX)) {
    return `${baseName} (Review)`;
  }

  if (isConflictResolveEditorPath(path)) {
    if (sourcePath === 'merge-conflicts') {
      return 'Merge Conflicts';
    }
    return `${baseName} (Conflict)`;
  }

  return baseName;
}

function getDiffTabName(name: string): string {
  return name.endsWith(' (Diff)') ? name : `${name} (Diff)`;
}

function getReviewDiffTabName(name: string): string {
  return name.endsWith(' (Review)') ? name : `${name} (Review)`;
}

export function getSpecialTabName(path: string, name: string): string {
  if (isReviewGroupEditorPath(path)) {
    return 'Review';
  }

  if (path.startsWith(EDITOR_REVIEW_DIFF_PREFIX)) {
    return getReviewDiffTabName(name);
  }

  if (isDiffGroupEditorPath(path)) {
    return getDiffGroupTabLabel(path);
  }

  if (isDiffEditorPath(path)) {
    return getDiffTabName(name);
  }

  return name;
}
