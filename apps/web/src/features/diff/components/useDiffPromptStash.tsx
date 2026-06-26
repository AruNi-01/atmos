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
import { MessageSquareText } from 'lucide-react';
import { toastManager } from '@workspace/ui';
import { DiffCopyAnnotation } from '@/features/diff/components/DiffCopyAnnotation';
import { AgentFixToolbar } from '@/features/agent-fix/components/AgentFixToolbar';
import type { AgentFixPromptSource } from '@/features/agent-fix/types';
import { useAgentFixContext } from '@/features/agent-fix/hooks/use-agent-fix-context';
import {
  buildDiffSelectionInfo,
  formatSelectedRangeLabel,
  isCopyAnnotation,
  type CopyAnnotationMeta,
  updateViewerDiffItem,
} from '@/features/diff/lib/diff-code-view-shared';
import { formatDiffSelectionForAI } from '@/shared/lib/format-selection-for-ai';

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

function basename(path: string) {
  return path.split('/').filter(Boolean).pop() || path;
}

function formatMergedDiffPrompt(prompts: StashedDiffPrompt[]) {
  return prompts
    .map((entry, index) => `# Comment ${index + 1}\n\n${entry.prompt}`)
    .join('\n\n---\n\n');
}

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
  const agentFixContext = useAgentFixContext();
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

  const cleanupAnnotationPrompt = useCallback(
    (itemId: string, key: string) => {
      removeStashedPrompt(itemId, key);
      removeDraftNote(key);
      removeCopyAnnotation(itemId, key);
    },
    [removeCopyAnnotation, removeDraftNote, removeStashedPrompt],
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

  const cleanupStashedPrompts = useCallback(() => {
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
  }, [removeCopyAnnotation, scope, stashedPrompts]);

  const stashedPromptChip = useMemo(() => {
    if (stashedPrompts.length === 0) return null;
    const source: AgentFixPromptSource = {
      id: `diff-stashed:${scope}`,
      family: 'diff',
      context: agentFixContext,
      label: `Fix ${stashedPrompts.length} diff comments`,
      disabledReason: agentFixContext ? null : 'Open a workspace or project to run Agent Fix.',
      getPrompt: () => ({
        prompt: formatMergedDiffPrompt(stashedPrompts),
        terminalTabTitle: `Fix diff comments (${stashedPrompts.length})`,
        terminalPaneLabel: 'Diff Comments Fix',
      }),
      onCopied: cleanupStashedPrompts,
      onStarted: cleanupStashedPrompts,
    };
    return (
      <div
        className="group/stashed-prompts relative z-10 inline-flex h-8 w-11 shrink-0 items-center rounded-md"
        title={`${stashedPrompts.length} stashed prompt comment${stashedPrompts.length === 1 ? '' : 's'}`}
      >
        <div className="absolute left-0 top-1/2 inline-flex h-6 w-11 -translate-y-1/2 items-center justify-center rounded-md border border-foreground bg-foreground px-1.5 text-[11px] font-semibold leading-none text-background transition-opacity duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/stashed-prompts:pointer-events-none group-hover/stashed-prompts:opacity-0 group-focus-within/stashed-prompts:pointer-events-none group-focus-within/stashed-prompts:opacity-0">
          <MessageSquareText className="mr-1 size-3 shrink-0" />
          <span className="w-3 text-center tabular-nums">{stashedPrompts.length}</span>
        </div>
        <div className="pointer-events-none absolute left-0 top-1/2 h-6 w-11 -translate-y-1/2 overflow-hidden rounded-md transition-[width] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/stashed-prompts:w-[208px] group-hover/stashed-prompts:pointer-events-auto group-focus-within/stashed-prompts:w-[208px] group-focus-within/stashed-prompts:pointer-events-auto">
          <AgentFixToolbar
            source={source}
            size="xs"
            variant="bottom"
            className="h-full w-[208px] opacity-0 transition-opacity duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/stashed-prompts:opacity-100 group-focus-within/stashed-prompts:opacity-100"
          />
        </div>
      </div>
    );
  }, [agentFixContext, cleanupStashedPrompts, scope, stashedPrompts]);

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
          onStash={handleStashAnnotation}
          onDismiss={handleDismissAnnotation}
          lineLabel={formatSelectedRangeLabel(annotation.metadata.range)}
          agentFixSource={{
            id: `diff:${scope}:${annotation.metadata.key}`,
            family: 'diff',
            context: agentFixContext,
            label: `Fix diff: ${basename(annotation.metadata.filePath)}`,
            disabledReason: agentFixContext ? null : 'Open a workspace or project to run Agent Fix.',
            getPrompt: () => {
              const prompt = buildPromptForAnnotation(
                annotation.metadata.filePath,
                annotation.metadata.key,
                draftNotes[annotation.metadata.key] ?? '',
              );
              if (!prompt) {
                throw new Error('No diff prompt could be built for this selection.');
              }
              return {
                prompt,
                terminalTabTitle: `Fix diff: ${basename(annotation.metadata.filePath)}`,
                terminalPaneLabel: `Fix ${basename(annotation.metadata.filePath)}`,
              };
            },
            onCopied: () => cleanupAnnotationPrompt(annotation.metadata.filePath, annotation.metadata.key),
            onStarted: () => cleanupAnnotationPrompt(annotation.metadata.filePath, annotation.metadata.key),
          }}
        />
      );
    },
    [
      agentFixContext,
      handleDismissAnnotation,
      handleDraftNoteChange,
      handleStashAnnotation,
      buildPromptForAnnotation,
      cleanupAnnotationPrompt,
      draftNotes,
      scope,
      stashedPrompts,
    ],
  );

  return {
    openCopyAnnotation,
    renderAnnotation,
    stashedPromptChip,
  };
}
