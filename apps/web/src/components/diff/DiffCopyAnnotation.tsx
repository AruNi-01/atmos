'use client';

import type { DiffLineAnnotation } from '@pierre/diffs';
import { Copy, X } from 'lucide-react';
import { Button, toastManager } from '@workspace/ui';
import { cn } from '@/lib/utils';
import type { CopyAnnotationMeta } from '@/components/diff/diff-code-view-shared';

interface DiffCopyAnnotationProps {
  annotation: DiffLineAnnotation<CopyAnnotationMeta>;
  itemId: string;
  onCopy: (itemId: string, key: string) => void;
  onDismiss: (itemId: string, key: string) => void;
}

export function DiffCopyAnnotation({
  annotation,
  itemId,
  onCopy,
  onDismiss,
}: DiffCopyAnnotationProps) {
  const { key } = annotation.metadata;
  const lineLabel =
    annotation.lineNumber === annotation.lineNumber
      ? `Line ${annotation.lineNumber}`
      : 'Selection';

  return (
    <div
      className={cn(
        'my-1 mx-2 flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-sm',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {lineLabel}
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 shrink-0 gap-1.5 px-2.5"
        onClick={() => onCopy(itemId, key)}
      >
        <Copy className="size-3.5" />
        Copy
      </Button>
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
        onClick={() => onDismiss(itemId, key)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
