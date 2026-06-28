'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Skeleton,
  Tabs,
  TabsList,
  TabsTab,
  Textarea,
  cn,
} from '@workspace/ui';
import { Eye, PencilLine, StickyNote } from 'lucide-react';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { useWorkspaceContextStore } from '@/features/workspace/hooks/use-workspace-context';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface WorkspaceNotePanelProps {
  contextId: string | null;
  effectivePath?: string | null;
  title?: string;
  className?: string;
  contentClassName?: string;
  compact?: boolean;
  defaultMode?: 'edit' | 'preview';
  previewFirst?: boolean;
}

export function WorkspaceNotePanel({
  contextId,
  effectivePath,
  title,
  className,
  contentClassName,
  compact = false,
  defaultMode = 'edit',
  previewFirst = false,
}: WorkspaceNotePanelProps) {
  const t = useTranslations("Workspace.components.notePanel");
  const resolvedTitle = title ?? t("title");
  const note = useWorkspaceContextStore((state) =>
    contextId ? state.workspaceStates[contextId]?.note ?? '' : '',
  );
  const noteLoading = useWorkspaceContextStore((state) => state.noteLoading);
  const loadNote = useWorkspaceContextStore((state) => state.loadNote);
  const saveNote = useWorkspaceContextStore((state) => state.saveNote);

  const [mode, setMode] = React.useState<'edit' | 'preview'>(defaultMode);
  const [draft, setDraft] = React.useState('');
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const dirtyRef = React.useRef(false);
  const draftRef = React.useRef('');
  const timerRef = React.useRef<number | null>(null);
  const mountedRef = React.useRef(false);
  const contextRef = React.useRef({ contextId, effectivePath, saveNote });

  const canUseNotes = Boolean(contextId && effectivePath);
  const modeOptions = React.useMemo(
    () => {
      const options: Array<'edit' | 'preview'> = ['edit', 'preview'];
      return previewFirst ? [...options].reverse() : options;
    },
    [previewFirst],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!dirtyRef.current) return;
      const current = contextRef.current;
      if (!current.contextId || !current.effectivePath) return;
      void current.saveNote(current.contextId, current.effectivePath, draftRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (dirtyRef.current) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const current = contextRef.current;
      if (current.contextId && current.effectivePath) {
        void current.saveNote(current.contextId, current.effectivePath, draftRef.current);
      }
    }

    dirtyRef.current = false;
    setSaveState('idle');
    setDraft('');
    draftRef.current = '';

    if (!contextId || !effectivePath) return;
    void loadNote(contextId, effectivePath);
  }, [contextId, effectivePath, loadNote]);

  React.useEffect(() => {
    contextRef.current = { contextId, effectivePath, saveNote };
  }, [contextId, effectivePath, saveNote]);

  React.useEffect(() => {
    if (dirtyRef.current) return;
    const next = note ?? '';
    setDraft(next);
    draftRef.current = next;
  }, [note]);

  const persist = React.useCallback(async (value: string) => {
    const current = contextRef.current;
    if (!current.contextId || !current.effectivePath) return;

    if (mountedRef.current) setSaveState('saving');
    try {
      await current.saveNote(current.contextId, current.effectivePath, value);
      if (draftRef.current === value) {
        dirtyRef.current = false;
        if (mountedRef.current) setSaveState('saved');
      }
    } catch (error) {
      console.error('Failed to save workspace note:', error);
      if (mountedRef.current) setSaveState('error');
    }
  }, []);

  const queueSave = React.useCallback((value: string) => {
    dirtyRef.current = true;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void persist(value);
    }, 650);
  }, [persist]);

  const flushSave = React.useCallback(() => {
    if (!dirtyRef.current) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void persist(draftRef.current);
  }, [persist]);

  const handleDraftChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft(value);
    draftRef.current = value;
    queueSave(value);
  }, [queueSave]);

  const statusLabel = React.useMemo(() => {
    if (!canUseNotes) return t("status.noContext");
    if (noteLoading && !draft) return t("status.loading");
    if (saveState === 'saving') return t("status.saving");
    if (saveState === 'saved') return t("status.saved");
    if (saveState === 'error') return t("status.saveFailed");
    return draft.trim() ? t("status.markdown") : t("status.empty");
  }, [canUseNotes, draft, noteLoading, saveState, t]);

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden border-border bg-background',
        compact ? 'rounded-md border' : 'border-l',
        className,
      )}
    >
      <div className={cn(
        'flex shrink-0 items-center justify-between gap-3 border-b border-border',
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
      )}>
        <div className="flex min-w-0 items-center gap-2">
          <StickyNote className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{resolvedTitle}</p>
            <p className="text-[11px] text-muted-foreground">{statusLabel}</p>
          </div>
        </div>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as 'edit' | 'preview')}
          className="shrink-0"
        >
          <TabsList className="h-8">
            {modeOptions.map((option) => (
              <TabsTab key={option} value={option} className="h-7 px-2.5 text-xs sm:h-7 sm:text-xs">
                {option === 'edit' ? <PencilLine className="size-3.5" /> : <Eye className="size-3.5" />}
                {option === 'edit' ? t("tabs.edit") : t("tabs.preview")}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-hidden', contentClassName)}>
        {!canUseNotes ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("empty.selectContext")}
          </div>
        ) : noteLoading && !draft ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : mode === 'edit' ? (
          <Textarea
            value={draft}
            onChange={handleDraftChange}
            onBlur={flushSave}
            placeholder={t("placeholder")}
            className="h-full min-h-full resize-none rounded-none border-0 bg-transparent px-4 py-3 text-sm leading-6 shadow-none focus-visible:ring-0"
          />
        ) : draft.trim() ? (
          <div className="h-full overflow-y-auto px-4 py-3 scrollbar-on-hover">
            <MarkdownRenderer className="prose-sm min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_.not-prose]:max-w-full [&_.not-prose]:overflow-x-auto">
              {draft}
            </MarkdownRenderer>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground/70">
            {t("empty.noNotes")}
          </div>
        )}
      </div>
    </section>
  );
}
