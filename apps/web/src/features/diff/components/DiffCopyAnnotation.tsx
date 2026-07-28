'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DiffLineAnnotation } from '@pierre/diffs';
import { Check, MessageSquarePlus, Save, Trash2 } from 'lucide-react';
import { Button, Textarea } from '@workspace/ui';
import { cn } from '@/shared/lib/utils';
import type { CopyAnnotationMeta, DiffListAnnotationMeta } from '@/features/diff/lib/diff-code-view-shared';
import { AgentFixToolbar } from '@/features/agent-fix/components/AgentFixToolbar';
import type { AgentFixPromptSource } from '@/features/agent-fix/types';

interface DiffCopyAnnotationProps {
  annotation: DiffLineAnnotation<CopyAnnotationMeta> | DiffLineAnnotation<DiffListAnnotationMeta>;
  itemId: string;
  isStashed: boolean;
  note: string;
  onNoteChange: (key: string, note: string) => void;
  onStash: (itemId: string, key: string, note: string) => void;
  onDismiss: (itemId: string, key: string) => void;
  lineLabel: string;
  agentFixSource: AgentFixPromptSource;
}

export function DiffCopyAnnotation({
  annotation,
  itemId,
  isStashed,
  note,
  onNoteChange,
  onStash,
  onDismiss,
  lineLabel,
  agentFixSource,
}: DiffCopyAnnotationProps) {
  const t = useTranslations('diff.copyAnnotation');
  const key =
    annotation.metadata.kind === 'copy' ? annotation.metadata.key : '';
  const [isEditingStashed, setIsEditingStashed] = useState(false);
  const savePointerDownRef = useRef(false);
  const isEditingStashedPrompt = isStashed && isEditingStashed;

  const handlePrimaryAction = () => {
    savePointerDownRef.current = false;
    onStash(itemId, key, note);
    if (isStashed) {
      setIsEditingStashed(false);
    }
  };
  const primaryLabel = isStashed
    ? (isEditingStashedPrompt ? t('actions.save') : t('actions.stashed'))
    : t('actions.stash');
  const secondaryLabel = isStashed ? t('actions.delete') : t('actions.cancel');

  return (
    <div
      className={cn(
        'mx-3 my-2 rounded-md border border-border/70 bg-popover/95 p-3 font-sans shadow-sm',
        isStashed && 'border-success/45',
      )}
    >
      <div className="space-y-0.5">
        <p className="text-sm font-medium leading-5 text-foreground">{lineLabel}</p>
        <p className="text-xs leading-4 text-muted-foreground">
          {t('description')}
        </p>
      </div>
      <Textarea
        value={note}
        onChange={(event) => {
          if (isStashed) {
            setIsEditingStashed(true);
          }
          onNoteChange(key, event.target.value);
        }}
        onFocus={() => {
          if (isStashed) {
            setIsEditingStashed(true);
          }
        }}
        onBlur={(event) => {
          if (!isStashed) return;
          const nextTarget = event.relatedTarget;
          if (
            savePointerDownRef.current ||
            (nextTarget instanceof HTMLElement &&
              nextTarget.closest('[data-stashed-save-action="true"]'))
          ) {
            return;
          }
          setIsEditingStashed(false);
        }}
        placeholder={t('placeholder')}
        className="mt-3 min-h-20 resize-y rounded-md border-border/70 bg-muted/20 font-sans text-sm leading-5 focus:bg-background"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 min-w-0 rounded-md px-2.5 text-xs font-medium"
          disabled={isStashed && !isEditingStashedPrompt}
          data-stashed-save-action={isEditingStashedPrompt ? "true" : undefined}
          onPointerDown={() => {
            if (isEditingStashedPrompt) {
              savePointerDownRef.current = true;
            }
          }}
          onClick={handlePrimaryAction}
        >
          {isStashed && !isEditingStashedPrompt ? (
            <Check className="mr-1.5 size-3.5" />
          ) : isEditingStashedPrompt ? (
            <Save className="mr-1.5 size-3.5" />
          ) : (
            <MessageSquarePlus className="mr-1.5 size-3.5" />
          )}
          {primaryLabel}
        </Button>
        <AgentFixToolbar source={agentFixSource} size="sm" className="shrink-0" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "ml-auto h-8 min-w-0 rounded-md px-2.5 text-xs font-medium",
            isStashed && "text-destructive hover:text-destructive",
          )}
          onClick={() => onDismiss(itemId, key)}
        >
          {isStashed ? <Trash2 className="mr-1.5 size-3.5" /> : null}
          {secondaryLabel}
        </Button>
      </div>
    </div>
  );
}
