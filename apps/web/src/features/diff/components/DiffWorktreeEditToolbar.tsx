'use client';

import { Loader2, RotateCcw, Save, SquarePen } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils';

type DiffWorktreeEditToolbarProps = {
  editingPath: string | null;
  isEditDirty: boolean;
  isSavingEdit: boolean;
  canStartOrToggleEdit: boolean;
  onPrimaryClick: () => void;
  onResetClick: () => void;
};

/**
 * Compact edit / save / reset control used by the Changes code-view toolbar.
 */
export function DiffWorktreeEditToolbar({
  editingPath,
  isEditDirty,
  isSavingEdit,
  canStartOrToggleEdit,
  onPrimaryClick,
  onResetClick,
}: DiffWorktreeEditToolbarProps) {
  const t = useTranslations('diff.codeView');
  const showResetButton = Boolean(editingPath && isEditDirty);
  // Clean → Edit icon. Dirty → Save icon + Reset icon peels out to the right.
  const primaryEditLabel = showResetButton ? t('edit.save') : t('edit.edit');
  const primaryEditTitle = showResetButton
    ? t('edit.saveShortcut')
    : primaryEditLabel;

  return (
    // Width-only expand/collapse for the reset control. Do not put `layout` on
    // this group or the primary button — layout projection fights the exit
    // width animation and causes a settle-then-snap when 2 buttons → 1.
    <div className="flex shrink-0 items-center overflow-hidden">
      <button
        type="button"
        className={cn(
          'relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50',
          showResetButton
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : editingPath
              ? 'bg-muted text-foreground hover:bg-muted/80'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
        disabled={isSavingEdit || (!editingPath && !canStartOrToggleEdit)}
        onClick={onPrimaryClick}
        title={primaryEditTitle}
        aria-label={primaryEditLabel}
        aria-pressed={editingPath != null && !isEditDirty ? true : undefined}
      >
        <AnimatePresence initial={false}>
          {isSavingEdit ? (
            <motion.span
              key="saving"
              initial={{ opacity: 0, scale: 0.7, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7, rotate: 20 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="size-3.5 animate-spin" />
            </motion.span>
          ) : showResetButton ? (
            <motion.span
              key="save"
              initial={{ opacity: 0, scale: 0.7, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7, y: -4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Save className="size-3.5" />
            </motion.span>
          ) : (
            <motion.span
              key="edit"
              initial={{ opacity: 0, scale: 0.7, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7, y: 4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <SquarePen className="size-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence initial={false}>
        {showResetButton ? (
          <motion.div
            key="reset"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 30, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.7 }}
            className="overflow-hidden"
          >
            <button
              type="button"
              className="ml-0.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={isSavingEdit}
              onClick={onResetClick}
              title={t('edit.reset')}
              aria-label={t('edit.reset')}
            >
              <RotateCcw className="size-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
