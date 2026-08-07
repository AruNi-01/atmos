'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { parseDiffFromFile } from '@pierre/diffs';
import type { CodeViewItem, FileContents } from '@pierre/diffs';
import type { CodeViewHandle } from '@pierre/diffs/react';
import { useTranslations } from 'next-intl';
import { toastManager } from '@workspace/ui';
import { fsApi } from '@/api/ws-api';
import { invalidateGitQueries } from '@/features/git/hooks/use-git-changed-files-query';
import { useGitStore } from '@/features/git/store/use-git-store';
import type { DiffChangeGroupKind } from '@/features/diff/lib/diff-editor-paths';
import {
  diffSideCacheKey,
  getNextItemVersion,
  isBinaryAnnotation,
  type DiffListAnnotationMeta,
} from '@/features/diff/lib/diff-code-view-shared';
import type { LoadedDiffContents } from '@/features/diff/components/useDiffPromptStash';

/** Worktree change groups whose new side maps to a local file we can write. */
export function isEditableWorktreeGroup(
  kind: DiffChangeGroupKind | null,
): kind is 'staged' | 'unstaged' | 'untracked' {
  return kind === 'staged' || kind === 'unstaged' || kind === 'untracked';
}

export function toAbsoluteRepoPath(repoPath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  const normalizedRepo = repoPath.endsWith('/') ? repoPath.slice(0, -1) : repoPath;
  return `${normalizedRepo}/${relativePath}`;
}

export function rebuildDiffItem(
  path: string,
  contents: LoadedDiffContents,
  base: CodeViewItem<DiffListAnnotationMeta>,
  edit: boolean,
): CodeViewItem<DiffListAnnotationMeta> {
  if (base.type !== 'diff') return base;
  const fileDiff = parseDiffFromFile(
    {
      name: path,
      contents: contents.oldContent,
      cacheKey: diffSideCacheKey(path, contents.oldContent),
    },
    {
      name: path,
      contents: contents.newContent,
      cacheKey: diffSideCacheKey(path, contents.newContent),
    },
  );
  return {
    ...base,
    fileDiff,
    edit,
    version: getNextItemVersion(base),
    collapsed: false,
  };
}

type UseDiffWorktreeEditArgs = {
  repoPath: string;
  /** Effective group kind after compare remapping. */
  effectiveGroupKind: DiffChangeGroupKind | null;
  selectedPath: string | undefined;
  codeViewRef: MutableRefObject<CodeViewHandle<DiffListAnnotationMeta> | null>;
  loadedContentsRef: MutableRefObject<Map<string, LoadedDiffContents>>;
  /** Reset session when the viewer identity changes. */
  resetKey: string | number | boolean;
};

/**
 * Inline edit session for worktree diffs (enter / draft / save / reset / Cmd-S).
 * Keeps pierre viewer item.edit flags and disk write orchestration out of the
 * main ChangesCodeView render path.
 */
export function useDiffWorktreeEdit({
  repoPath,
  effectiveGroupKind,
  selectedPath,
  codeViewRef,
  loadedContentsRef,
  resetKey,
}: UseDiffWorktreeEditArgs) {
  const t = useTranslations('diff.codeView');
  const stageFiles = useGitStore((s) => s.stageFiles);

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [isEditDirty, setIsEditDirty] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const draftContentsRef = useRef<Map<string, string>>(new Map());
  const editingPathRef = useRef<string | null>(null);
  const isEditDirtyRef = useRef(false);
  const isSavingEditRef = useRef(false);

  useEffect(() => {
    editingPathRef.current = editingPath;
  }, [editingPath]);

  useEffect(() => {
    isEditDirtyRef.current = isEditDirty;
  }, [isEditDirty]);

  const canEditWorktree = isEditableWorktreeGroup(effectiveGroupKind);

  const isBinaryItem = useCallback(
    (item: CodeViewItem<DiffListAnnotationMeta> | undefined) => {
      if (item == null || item.type !== 'diff') return true;
      return item.annotations?.some((annotation) => isBinaryAnnotation(annotation)) ?? false;
    },
    [],
  );

  const setItemEditMode = useCallback(
    (path: string, edit: boolean) => {
      const viewer = codeViewRef.current;
      const item = viewer?.getItem(path);
      if (viewer == null || item == null || item.type !== 'diff') return false;
      if (isBinaryItem(item)) return false;
      item.edit = edit;
      item.collapsed = false;
      item.version = getNextItemVersion(item);
      viewer.updateItem(item);
      return true;
    },
    [codeViewRef, isBinaryItem],
  );

  const handleEnterEdit = useCallback(
    (path: string) => {
      if (!canEditWorktree) return;
      const currentEditing = editingPathRef.current;
      if (currentEditing && currentEditing !== path) {
        if (isEditDirtyRef.current) {
          toastManager.add({
            title: t('edit.unsavedTitle'),
            description: t('edit.unsavedDescription'),
            type: 'error',
          });
          return;
        }
        setItemEditMode(currentEditing, false);
        draftContentsRef.current.delete(currentEditing);
      }
      if (!setItemEditMode(path, true)) return;
      const original = loadedContentsRef.current.get(path)?.newContent ?? '';
      draftContentsRef.current.set(path, original);
      setEditingPath(path);
      setIsEditDirty(false);
    },
    [canEditWorktree, loadedContentsRef, setItemEditMode, t],
  );

  const handleExitEdit = useCallback(
    (path: string) => {
      setItemEditMode(path, false);
      draftContentsRef.current.delete(path);
      if (editingPathRef.current === path) {
        setEditingPath(null);
        setIsEditDirty(false);
      }
    },
    [setItemEditMode],
  );

  const handleResetEdit = useCallback(() => {
    const path = editingPathRef.current;
    if (path == null) return;
    const viewer = codeViewRef.current;
    const item = viewer?.getItem(path);
    const original = loadedContentsRef.current.get(path);
    if (viewer == null || item == null || item.type !== 'diff' || original == null) {
      return;
    }
    // End the session then re-open so the editor document is rebuilt from the
    // original new-side contents (pierre owns the live document while edit is on).
    const closed = rebuildDiffItem(path, original, item, false);
    viewer.updateItem(closed);
    const reopenedBase = viewer.getItem(path) ?? closed;
    const reopened = rebuildDiffItem(path, original, reopenedBase, true);
    viewer.updateItem(reopened);
    draftContentsRef.current.set(path, original.newContent);
    setIsEditDirty(false);
  }, [codeViewRef, loadedContentsRef]);

  const handleSaveEdit = useCallback(async () => {
    const path = editingPathRef.current;
    if (path == null || isSavingEditRef.current) return;
    const draft =
      draftContentsRef.current.get(path) ??
      loadedContentsRef.current.get(path)?.newContent;
    if (draft == null) return;

    isSavingEditRef.current = true;
    setIsSavingEdit(true);
    try {
      const absolutePath = toAbsoluteRepoPath(repoPath, path);
      await fsApi.writeFile(absolutePath, draft);
      if (effectiveGroupKind === 'staged') {
        await stageFiles([path]);
      }
      const previous = loadedContentsRef.current.get(path);
      loadedContentsRef.current.set(path, {
        oldContent: previous?.oldContent ?? '',
        newContent: draft,
      });
      draftContentsRef.current.set(path, draft);

      const viewer = codeViewRef.current;
      const item = viewer?.getItem(path);
      const contents = loadedContentsRef.current.get(path);
      if (viewer != null && item != null && item.type === 'diff' && contents != null) {
        viewer.updateItem(rebuildDiffItem(path, contents, item, false));
      }

      setEditingPath(null);
      setIsEditDirty(false);
      draftContentsRef.current.delete(path);
      await invalidateGitQueries(repoPath);
    } catch (error) {
      toastManager.add({
        title: t('edit.saveFailedTitle'),
        description:
          error instanceof Error ? error.message : t('edit.saveFailedFallback'),
        type: 'error',
      });
    } finally {
      isSavingEditRef.current = false;
      setIsSavingEdit(false);
    }
  }, [
    codeViewRef,
    effectiveGroupKind,
    loadedContentsRef,
    repoPath,
    stageFiles,
    t,
  ]);

  const handleEditButtonClick = useCallback(() => {
    if (editingPath != null) {
      if (isEditDirty) {
        void handleSaveEdit();
        return;
      }
      handleExitEdit(editingPath);
      return;
    }
    if (selectedPath) {
      handleEnterEdit(selectedPath);
    }
  }, [
    editingPath,
    handleEnterEdit,
    handleExitEdit,
    handleSaveEdit,
    isEditDirty,
    selectedPath,
  ]);

  const handleItemEditChange = useCallback(
    (item: CodeViewItem<DiffListAnnotationMeta>, file: FileContents) => {
      const original = loadedContentsRef.current.get(item.id)?.newContent ?? '';
      draftContentsRef.current.set(item.id, file.contents);
      if (editingPathRef.current === item.id) {
        setIsEditDirty(file.contents !== original);
      }
    },
    [loadedContentsRef],
  );

  // Cmd/Ctrl+S saves while a worktree diff is being edited.
  useEffect(() => {
    if (!canEditWorktree || editingPath == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!isEditDirtyRef.current) return;
      void handleSaveEdit();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [canEditWorktree, editingPath, handleSaveEdit]);

  // Drop edit session when the group reloads or leaves worktree mode.
  useEffect(() => {
    setEditingPath(null);
    setIsEditDirty(false);
    draftContentsRef.current.clear();
  }, [resetKey, canEditWorktree]);

  return {
    canEditWorktree,
    editingPath,
    isEditDirty,
    isSavingEdit,
    handleEnterEdit,
    handleExitEdit,
    handleResetEdit,
    handleSaveEdit,
    handleEditButtonClick,
    handleItemEditChange,
  };
}
