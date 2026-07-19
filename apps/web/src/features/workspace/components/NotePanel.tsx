'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Skeleton,
  Textarea,
  cn,
} from '@workspace/ui';
import { Loader2, Plus, StickyNote } from 'lucide-react';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';

export interface NotePanelProps {
  note: string | null;
  noteLoading: boolean;
  effectivePath: string | null | undefined;
  saveNote: (path: string, content: string) => Promise<void>;
  /** Show the title + edit/save header row. Defaults to true. */
  showHeader?: boolean;
  className?: string;
  contentClassName?: string;
}

export const NotePanel: React.FC<NotePanelProps> = ({
  note,
  noteLoading,
  effectivePath,
  saveNote,
  showHeader = true,
  className,
  contentClassName,
}) => {
  const t = useTranslations('Workspace.components.overviewTab');
  const [isEditing, setIsEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(note ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const saveRef = useRef(false);

  useEffect(() => {
    if (!isEditing && !isSaving) {
      setDraftNote(note ?? '');
    }
  }, [isEditing, isSaving, note]);

  const handleStartEdit = useCallback(() => {
    if (!effectivePath) return;
    setDraftNote(note ?? '');
    setIsEditing(true);
  }, [effectivePath, note]);

  const handleSave = useCallback(async () => {
    if (!effectivePath || saveRef.current) return;
    if (draftNote === (note ?? '')) {
      setIsEditing(false);
      return;
    }
    saveRef.current = true;
    setIsSaving(true);
    try {
      await saveNote(effectivePath, draftNote);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save note', error);
    } finally {
      saveRef.current = false;
      setIsSaving(false);
    }
  }, [draftNote, effectivePath, note, saveNote]);

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      {showHeader ? (
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <StickyNote className="size-3.5" />
            {t('note.title')}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer gap-1.5 px-3 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={isEditing ? () => void handleSave() : handleStartEdit}
            disabled={!effectivePath || isSaving}
          >
            {isSaving ? <Loader2 className="size-3 animate-spin" /> : null}
            {isEditing ? t('actions.save') : t('actions.edit')}
          </Button>
        </div>
      ) : null}

      <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden p-4', contentClassName)}>
        {noteLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : isEditing ? (
          <Textarea
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void handleSave();
              }
            }}
            autoFocus
            placeholder={t('note.placeholder')}
            disabled={!effectivePath}
            className="min-h-0 h-full max-h-full flex-1 resize-none overflow-y-auto !field-sizing-fixed rounded-md border-border bg-muted/30 text-[13px] leading-relaxed"
          />
        ) : note ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-on-hover">
            <MarkdownRenderer className="text-[13px] text-muted-foreground leading-relaxed">
              {note}
            </MarkdownRenderer>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border py-10 text-center">
            <StickyNote className="mb-2 size-5 text-muted-foreground/30" />
            <h3 className="mb-1 text-[13px] text-muted-foreground">{t('note.emptyTitle')}</h3>
            <p className="mb-4 max-w-[240px] text-[11px] text-muted-foreground/50">
              {t('note.emptyDescription')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartEdit}
              disabled={!effectivePath}
              className="h-8 cursor-pointer gap-1.5 text-[11px] hover:bg-muted"
            >
              <Plus className="size-3.5" />
              {t('note.add')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotePanel;
