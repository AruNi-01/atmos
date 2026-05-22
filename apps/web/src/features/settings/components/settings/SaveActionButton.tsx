'use client';

import { Button, cn } from '@workspace/ui';
import { LoaderCircle, Save } from 'lucide-react';

export function SaveActionButton({
  saving,
  onClick,
  className,
}: {
  saving?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={saving}
      className={cn('h-8 rounded-lg px-3 shadow-sm', className)}
    >
      {saving ? <LoaderCircle className="size-4 animate-spin-reverse" /> : <Save className="size-4" />}
      Save
    </Button>
  );
}
