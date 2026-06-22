'use client';

import type { DiffLineAnnotation } from '@pierre/diffs';
import { Check, Copy, MessageSquarePlus } from 'lucide-react';
import { Button, Textarea } from '@workspace/ui';
import { cn } from '@/shared/lib/utils';
import type { CopyAnnotationMeta } from '@/features/diff/lib/diff-code-view-shared';

interface DiffCopyAnnotationProps {
  annotation: DiffLineAnnotation<CopyAnnotationMeta>;
  itemId: string;
  isStashed: boolean;
  note: string;
  onNoteChange: (key: string, note: string) => void;
  onCopy: (itemId: string, key: string, note: string) => void;
  onStash: (itemId: string, key: string, note: string) => void;
  onDismiss: (itemId: string, key: string) => void;
  lineLabel: string;
}

export function DiffCopyAnnotation({
  annotation,
  itemId,
  isStashed,
  note,
  onNoteChange,
  onCopy,
  onStash,
  onDismiss,
  lineLabel,
}: DiffCopyAnnotationProps) {
  const { key } = annotation.metadata;

  return (
    <div
      className={cn(
        'mx-3 my-2 rounded-md border border-border/70 bg-popover/95 p-3 font-sans shadow-sm',
        isStashed && 'border-success/35 bg-success/5',
      )}
    >
      <div className="space-y-0.5">
        <p className="text-sm font-medium leading-5 text-foreground">{lineLabel}</p>
        <p className="text-xs leading-4 text-muted-foreground">
          Add context for the prompt before copying it.
        </p>
      </div>
      <Textarea
        value={note}
        onChange={(event) => onNoteChange(key, event.target.value)}
        placeholder="What should the prompt focus on?"
        readOnly={isStashed}
        className="mt-3 min-h-20 resize-y rounded-md border-border/70 bg-muted/20 font-sans text-sm leading-5 focus:bg-background"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 min-w-0 rounded-md px-2.5 text-xs font-medium"
          disabled={isStashed}
          onClick={() => onStash(itemId, key, note)}
        >
          {isStashed ? (
            <Check className="mr-1.5 size-3.5" />
          ) : (
            <MessageSquarePlus className="mr-1.5 size-3.5" />
          )}
          {isStashed ? 'Stashed' : 'Stash'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 min-w-0 rounded-md px-2.5 text-xs font-medium"
          onClick={() => onCopy(itemId, key, note)}
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 min-w-0 rounded-md px-2.5 text-xs font-medium"
          onClick={() => onDismiss(itemId, key)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
