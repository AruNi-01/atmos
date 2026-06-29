'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Copy, Paperclip, Plus } from 'lucide-react';
import { Button, Textarea, cn } from '@workspace/ui';
import type { SelectionInfo } from '@/shared/lib/format-selection-for-ai';
import type { SelectionType } from './SelectionPopover';

interface SelectionPopoverDetailsProps {
  displayInfo: SelectionInfo;
  type: SelectionType;
  userNote: string;
  copied: boolean;
  attaching: boolean;
  canAttach: boolean;
  canAddPreviewAnnotation: boolean;
  isEditingPreviewAnnotation: boolean;
  onUserNoteChange: (value: string) => void;
  onDismiss: () => void;
  onAttachWithNote: () => void;
  onAddAnnotation: () => void;
  onCopyWithNote: () => void;
  onUpdateAnnotation: () => void;
}

export function SelectionPopoverDetails({
  displayInfo,
  type,
  userNote,
  copied,
  attaching,
  canAttach,
  canAddPreviewAnnotation,
  isEditingPreviewAnnotation,
  onUserNoteChange,
  onDismiss,
  onAttachWithNote,
  onAddAnnotation,
  onCopyWithNote,
  onUpdateAnnotation,
}: SelectionPopoverDetailsProps) {
  const t = useTranslations('Selection.components');
  const lineRange = displayInfo.startLine > 0
    ? (displayInfo.startLine === displayInfo.endLine
      ? `L${displayInfo.startLine}`
      : `L${displayInfo.startLine}-L${displayInfo.endLine}`)
    : null;
  const previewComponentLabel = type === 'preview' ? displayInfo.componentName?.trim() : null;
  const previewFrameworkLabel = type === 'preview' ? displayInfo.framework?.trim() : null;
  const previewDebugSignals = type === 'preview'
    ? (displayInfo.sourceDebugSignals?.filter(Boolean) ?? [])
    : [];
  const previewSourceConfidence = type === 'preview' ? displayInfo.sourceConfidence : null;
  const previewConfidenceLabelClassName = previewSourceConfidence === 'high'
    ? 'border-success/30 bg-success/10 text-success'
    : previewSourceConfidence === 'medium'
      ? 'border-warning/30 bg-warning/10 text-warning'
      : previewSourceConfidence === 'low'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-border bg-muted/40 text-muted-foreground';

  return (
    <div className="space-y-3">
      <div className="flex w-full min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono"
          title={displayInfo.filePath}
          style={{ direction: 'rtl', textAlign: 'left' }}
        >
          <bdi>{displayInfo.filePath}</bdi>
        </span>
        {lineRange && (
          <>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{lineRange}</span>
          </>
        )}
        {displayInfo.changeType && (
          <>
            <span className="shrink-0">·</span>
            <span className={cn(
              'shrink-0',
              displayInfo.changeType === 'addition' && 'text-green-500',
              displayInfo.changeType === 'deletion' && 'text-red-500',
            )}>
              {displayInfo.changeType === 'addition'
                ? t('details.changeType.addition')
                : displayInfo.changeType === 'deletion'
                  ? t('details.changeType.deletion')
                  : displayInfo.changeType}
            </span>
          </>
        )}
        {previewFrameworkLabel && (
          <>
            <span className="shrink-0">·</span>
            <span className="shrink-0 capitalize">{previewFrameworkLabel}</span>
          </>
        )}
        {previewComponentLabel && (
          <>
            <span className="shrink-0">·</span>
            <span
              className="max-w-[140px] shrink overflow-hidden text-ellipsis whitespace-nowrap font-medium text-foreground"
              title={previewComponentLabel}
            >
              {previewComponentLabel}
            </span>
          </>
        )}
      </div>

      <Textarea
        placeholder={t('details.notePlaceholder')}
        value={userNote}
        onChange={(event) => onUserNoteChange(event.target.value)}
        className="min-h-[80px] resize-none text-sm"
        autoFocus
      />

      {previewDebugSignals.length > 0 || previewSourceConfidence ? (
        <ConfidenceDisclosure
          confidence={previewSourceConfidence}
          confidenceClassName={previewConfidenceLabelClassName}
          debugSignals={previewDebugSignals}
        />
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
        >
          {t('details.actions.cancel')}
        </Button>
        {isEditingPreviewAnnotation ? (
          <Button
            size="sm"
            onClick={onUpdateAnnotation}
            disabled={attaching}
          >
            {t('details.actions.update')}
          </Button>
        ) : (
          <>
            {canAttach ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onAttachWithNote}
                disabled={attaching}
              >
                <Paperclip className="h-3.5 w-3.5" />
                {attaching ? t('details.actions.attaching') : t('details.actions.attach')}
              </Button>
            ) : null}
            {canAddPreviewAnnotation ? (
              <Button
                size="sm"
                onClick={onAddAnnotation}
                disabled={attaching}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('details.actions.add')}
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={onCopyWithNote}
              disabled={attaching}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {t('details.actions.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  {canAddPreviewAnnotation ? t('details.actions.copy') : t('details.actions.copyForAi')}
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ConfidenceDisclosure({
  confidence,
  confidenceClassName,
  debugSignals,
}: {
  confidence: SelectionInfo['sourceConfidence'] | null | undefined;
  confidenceClassName: string;
  debugSignals: string[];
}) {
  const t = useTranslations('Selection.components');
  return (
    <details className="group space-y-1">
      <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md py-0.5 text-left transition-colors hover:text-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none" />
          <div className="truncate text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
            {t('details.sourceCodeConfidence')}
          </div>
        </div>
        {confidence ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]',
              confidenceClassName,
            )}
          >
            {confidence === 'high'
              ? t('details.confidence.high')
              : confidence === 'medium'
                ? t('details.confidence.medium')
                : confidence === 'low'
                  ? t('details.confidence.low')
                  : confidence}
          </span>
        ) : null}
      </summary>
      <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
        {debugSignals.length > 0 ? debugSignals.join(', ') : t('details.noExtraDebugSignals')}
      </div>
    </details>
  );
}
