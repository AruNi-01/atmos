'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import type { DiffLineAnnotation, SelectedLineRange } from '@pierre/diffs';
import type { CodeViewHandle } from '@pierre/diffs/react';
import { Copy, MessageSquareText } from 'lucide-react';
import { toastManager } from '@workspace/ui';
import { DiffCopyAnnotation } from '@/features/diff/components/DiffCopyAnnotation';
import {
  buildDiffSelectionInfo,
  formatSelectedRangeLabel,
  isCopyAnnotation,
  type CopyAnnotationMeta,
  updateViewerDiffItem,
} from '@/features/diff/lib/diff-code-view-shared';
import { formatDiffSelectionForAI } from '@/shared/lib/format-selection-for-ai';
import { cn } from '@/shared/lib/utils';

export type LoadedDiffContents = {
  oldContent: string;
  newContent: string;
};

type StashedDiffPrompt = {
  itemId: string;
  key: string;
  prompt: string;
};

type StashedDiffPromptState = {
  scope: string;
  prompts: StashedDiffPrompt[];
};

type DraftPromptNoteState = {
  scope: string;
  notes: Record<string, string>;
};

const EMPTY_STASHED_PROMPTS: StashedDiffPrompt[] = [];
const EMPTY_DRAFT_NOTES: Record<string, string> = {};

type UseDiffPromptStashArgs = {
  scope: string;
  viewerRef: MutableRefObject<CodeViewHandle<CopyAnnotationMeta> | null>;
  loadedContentsRef: MutableRefObject<Map<string, LoadedDiffContents>>;
};

export function useDiffPromptStash({
  scope,
  viewerRef,
  loadedContentsRef,
}: UseDiffPromptStashArgs) {
  const copyKeyRef = useRef(0);
  const [stashedPromptState, setStashedPromptState] =
    useState<StashedDiffPromptState>(() => ({
      scope,
      prompts: [],
    }));
  const stashedPrompts = useMemo(
    () =>
      stashedPromptState.scope === scope
        ? stashedPromptState.prompts
        : EMPTY_STASHED_PROMPTS,
    [scope, stashedPromptState],
  );
  const [draftNoteState, setDraftNoteState] =
    useState<DraftPromptNoteState>(() => ({
      scope,
      notes: EMPTY_DRAFT_NOTES,
    }));
  const draftNotes = useMemo(
    () =>
      draftNoteState.scope === scope ? draftNoteState.notes : EMPTY_DRAFT_NOTES,
    [draftNoteState, scope],
  );

  const removeCopyAnnotation = useCallback(
    (itemId: string, key: string) => {
      updateViewerDiffItem(viewerRef.current, itemId, (item) => {
        if (!item.annotations?.length) return false;
        const next = item.annotations.filter((a) => a.metadata?.key !== key);
        if (next.length === item.annotations.length) return false;
        item.annotations = next;
        return true;
      });
    },
    [viewerRef],
  );

  const removeStashedPrompt = useCallback(
    (itemId: string, key: string) => {
      setStashedPromptState((current) => {
        if (current.scope !== scope) return current;
        return {
          scope: current.scope,
          prompts: current.prompts.filter(
            (entry) => entry.itemId !== itemId || entry.key !== key,
          ),
        };
      });
    },
    [scope],
  );

  const removeDraftNote = useCallback(
    (key: string) => {
      setDraftNoteState((current) => {
        if (current.scope !== scope || !(key in current.notes)) {
          return current;
        }
        const notes = { ...current.notes };
        delete notes[key];
        return { scope: current.scope, notes };
      });
    },
    [scope],
  );

  const handleDraftNoteChange = useCallback(
    (key: string, note: string) => {
      setDraftNoteState((current) => ({
        scope,
        notes: {
          ...(current.scope === scope ? current.notes : EMPTY_DRAFT_NOTES),
          [key]: note,
        },
      }));
    },
    [scope],
  );

  const handleDismissAnnotation = useCallback(
    (itemId: string, key: string) => {
      removeStashedPrompt(itemId, key);
      removeDraftNote(key);
      removeCopyAnnotation(itemId, key);
    },
    [removeCopyAnnotation, removeDraftNote, removeStashedPrompt],
  );

  const buildPromptForAnnotation = useCallback(
    (itemId: string, key: string, note: string) => {
      const item = viewerRef.current?.getItem(itemId);
      const contents = loadedContentsRef.current.get(itemId);
      if (item?.type !== 'diff' || !contents) return null;

      const annotation = item.annotations?.find(
        (a) => isCopyAnnotation(a) && a.metadata.key === key,
      );
      if (!annotation || !isCopyAnnotation(annotation)) return null;

      const selectionInfo = buildDiffSelectionInfo({
        filePath: annotation.metadata.filePath,
        fileDiff: item.fileDiff,
        contents,
        range: annotation.metadata.range,
      });
      return selectionInfo ? formatDiffSelectionForAI(selectionInfo, note) : null;
    },
    [loadedContentsRef, viewerRef],
  );

  const handleCopyAnnotation = useCallback(
    (itemId: string, key: string, note: string) => {
      const prompt = buildPromptForAnnotation(itemId, key, note);
      if (!prompt) {
        toastManager.add({
          title: 'Nothing to copy',
          type: 'error',
        });
        return;
      }

      void navigator.clipboard.writeText(prompt).catch(() =>
        toastManager.add({
          title: 'Failed to copy prompt',
          type: 'error',
        }),
      );
      removeStashedPrompt(itemId, key);
      removeDraftNote(key);
      removeCopyAnnotation(itemId, key);
    },
    [
      buildPromptForAnnotation,
      removeCopyAnnotation,
      removeDraftNote,
      removeStashedPrompt,
    ],
  );

  const handleStashAnnotation = useCallback(
    (itemId: string, key: string, note: string) => {
      const prompt = buildPromptForAnnotation(itemId, key, note);
      if (!prompt) {
        toastManager.add({
          title: 'Nothing to stash',
          type: 'error',
        });
        return;
      }

      setStashedPromptState((current) => ({
        scope,
        prompts:
          current.scope === scope
            ? [
                ...current.prompts.filter(
                  (entry) => entry.itemId !== itemId || entry.key !== key,
                ),
                { itemId, key, prompt },
              ]
            : [{ itemId, key, prompt }],
      }));
    },
    [buildPromptForAnnotation, scope],
  );

  const handleCopyStashedPrompts = useCallback(() => {
    if (stashedPrompts.length === 0) return;
    const prompt = stashedPrompts
      .map((entry, index) => `# Comment ${index + 1}\n\n${entry.prompt}`)
      .join('\n\n---\n\n');

    void navigator.clipboard.writeText(prompt).then(
      () => {
        const copiedKeys = new Set(stashedPrompts.map((entry) => entry.key));
        for (const entry of stashedPrompts) {
          removeCopyAnnotation(entry.itemId, entry.key);
        }
        setDraftNoteState((current) => {
          if (current.scope !== scope) return current;
          return {
            scope: current.scope,
            notes: Object.fromEntries(
              Object.entries(current.notes).filter(
                ([key]) => !copiedKeys.has(key),
              ),
            ),
          };
        });
        setStashedPromptState({ scope, prompts: [] });
      },
      () =>
        toastManager.add({
          title: 'Failed to copy prompt',
          type: 'error',
        }),
    );
  }, [removeCopyAnnotation, scope, stashedPrompts]);

  const stashedPromptChip = useMemo(() => {
    if (stashedPrompts.length === 0) return null;
    return (
      <button
        type="button"
        onClick={handleCopyStashedPrompts}
        className={cn(
          'group/comment-chip inline-flex h-7 max-w-[58px] shrink-0 items-center justify-start overflow-hidden rounded-md border border-foreground bg-foreground px-2 text-xs font-semibold text-background shadow-sm',
          'transition-[max-width,background-color,border-color,color,box-shadow] duration-300 ease-out hover:max-w-[132px] hover:bg-background hover:text-foreground hover:shadow-md',
          'dark:border-foreground dark:bg-foreground dark:text-background dark:hover:bg-background dark:hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
        aria-label={`Copy ${stashedPrompts.length} stashed prompt comment${stashedPrompts.length === 1 ? '' : 's'}`}
        title="Copy Prompt"
      >
        <span className="relative mr-1.5 flex size-3.5 shrink-0 items-center justify-center">
          <MessageSquareText className="absolute size-3.5 transition-all duration-300 ease-out group-hover/comment-chip:scale-75 group-hover/comment-chip:opacity-0" />
          <Copy className="absolute size-3.5 scale-75 opacity-0 transition-all duration-300 ease-out group-hover/comment-chip:scale-100 group-hover/comment-chip:opacity-100" />
        </span>
        <span className="w-4 overflow-hidden text-center text-xs tabular-nums transition-[width,opacity,transform] duration-300 ease-out group-hover/comment-chip:w-0 group-hover/comment-chip:-translate-x-1 group-hover/comment-chip:opacity-0">
          {stashedPrompts.length}
        </span>
        <span className="ml-0 max-w-0 whitespace-nowrap opacity-0 transition-[max-width,opacity,margin-left] duration-300 ease-out group-hover/comment-chip:max-w-24 group-hover/comment-chip:opacity-100">
          Copy Prompt
        </span>
      </button>
    );
  }, [handleCopyStashedPrompts, stashedPrompts.length]);

  const openCopyAnnotation = useCallback(
    (itemId: string, range: SelectedLineRange) => {
      const viewer = viewerRef.current;
      if (viewer == null) return;

      const side = range.endSide ?? range.side;
      if (!side) return;

      const lineNumber = range.end;
      const key = `copy-${copyKeyRef.current++}`;

      updateViewerDiffItem(viewer, itemId, (item) => {
        const removedEmptyKeys: string[] = [];
        const stashedKeys = new Set(stashedPrompts.map((entry) => entry.key));
        const existingAnnotations = (item.annotations ?? []).filter((annotation) => {
          if (!isCopyAnnotation(annotation)) return true;
          if (stashedKeys.has(annotation.metadata.key)) return true;
          if ((draftNotes[annotation.metadata.key] ?? '').trim()) return true;
          removedEmptyKeys.push(annotation.metadata.key);
          return false;
        });

        const hasExistingRange = existingAnnotations.some((annotation) => {
          if (!isCopyAnnotation(annotation)) return false;
          const existingRange = annotation.metadata.range;
          return (
            annotation.side === side &&
            existingRange.side === range.side &&
            existingRange.endSide === range.endSide &&
            existingRange.start === range.start &&
            existingRange.end === range.end
          );
        });
        if (hasExistingRange) return false;

        item.annotations = [
          ...existingAnnotations,
          {
            side,
            lineNumber,
            metadata: { kind: 'copy', key, filePath: itemId, range },
          },
        ];

        if (removedEmptyKeys.length > 0) {
          setDraftNoteState((current) => {
            if (current.scope !== scope) return current;
            const removed = new Set(removedEmptyKeys);
            return {
              scope: current.scope,
              notes: Object.fromEntries(
                Object.entries(current.notes).filter(
                  ([entryKey]) => !removed.has(entryKey),
                ),
              ),
            };
          });
        }
        return true;
      });
    },
    [draftNotes, scope, stashedPrompts, viewerRef],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<CopyAnnotationMeta>) => {
      if (!isCopyAnnotation(annotation)) return null;
      const isStashed = stashedPrompts.some(
        (entry) =>
          entry.itemId === annotation.metadata.filePath &&
          entry.key === annotation.metadata.key,
      );
      return (
        <DiffCopyAnnotation
          annotation={annotation}
          itemId={annotation.metadata.filePath}
          isStashed={isStashed}
          note={draftNotes[annotation.metadata.key] ?? ''}
          onNoteChange={handleDraftNoteChange}
          onCopy={handleCopyAnnotation}
          onStash={handleStashAnnotation}
          onDismiss={handleDismissAnnotation}
          lineLabel={formatSelectedRangeLabel(annotation.metadata.range)}
        />
      );
    },
    [
      handleCopyAnnotation,
      handleDismissAnnotation,
      handleDraftNoteChange,
      handleStashAnnotation,
      draftNotes,
      stashedPrompts,
    ],
  );

  return {
    openCopyAnnotation,
    renderAnnotation,
    stashedPromptChip,
  };
}
