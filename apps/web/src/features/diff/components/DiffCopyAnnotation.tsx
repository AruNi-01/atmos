'use client';

import { useState } from 'react';
import type { DiffLineAnnotation } from '@pierre/diffs';
import { Copy, X } from 'lucide-react';
import { Button, Textarea } from '@workspace/ui';
import { cn } from '@/shared/lib/utils';
import type { CopyAnnotationMeta } from '@/features/diff/lib/diff-code-view-shared';

interface DiffCopyAnnotationProps {
  annotation: DiffLineAnnotation<CopyAnnotationMeta>;
  itemId: string;
  onCopy: (itemId: string, key: string, note: string) => void;
  onDismiss: (itemId: string, key: string) => void;
  lineLabel: string;
}

export function DiffCopyAnnotation({
  annotation,
  itemId,
  onCopy,
  onDismiss,
  lineLabel,
}: DiffCopyAnnotationProps) {
  const { key } = annotation.metadata;
  const [note, setNote] = useState('');

  return (
    <div
      className={cn(
        'mx-3 my-2 rounded-lg border border-primary/20 bg-background/95 p-3 shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{lineLabel}</p>
          <p className="text-xs text-muted-foreground">
            Add context for the prompt before copying it.
          </p>
        </div>
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
          onClick={() => onDismiss(itemId, key)}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What should the prompt focus on?"
        className="mt-3 min-h-24 bg-background"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onCopy(itemId, key, note)}
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy Prompt
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onDismiss(itemId, key)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
