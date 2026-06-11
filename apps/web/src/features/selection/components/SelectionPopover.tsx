'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, ChevronDown, Check, Paperclip, Plus } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
  PopoverTrigger,
  Button,
  Textarea,
  cn,
  toastManager,
} from '@workspace/ui';
import type { SelectionInfo } from '@/shared/lib/format-selection-for-ai';
import {
  formatEditorSelectionForAI,
  formatDiffSelectionForAI,
  formatPreviewSelectionForAI,
  formatWikiSelectionForAI,
} from '@/shared/lib/format-selection-for-ai';

export type SelectionType = 'editor' | 'diff' | 'wiki' | 'preview';

export interface SelectionCopiedPayload {
  type: SelectionType;
  selectionInfo: SelectionInfo;
  formattedText: string;
  includeNote: boolean;
}

export type SelectionAttachedPayload = SelectionCopiedPayload;

interface SelectionPopoverProps {
  isVisible: boolean;
  position: { x: number; y: number };
  selectionInfo: SelectionInfo | null;
  isExpanded: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  type: SelectionType;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  positioning?: 'absolute' | 'fixed';
  onCopied?: (payload: SelectionCopiedPayload) => void;
  onAttach?: (payload: SelectionAttachedPayload) => Promise<void> | void;
  onAddAnnotation?: (selectionInfo: SelectionInfo, note?: string) => void;
  onUpdateAnnotation?: (selectionInfo: SelectionInfo, note?: string) => void;
  annotationMode?: 'add' | 'edit';
  initialNote?: string;
}

export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
  isVisible,
  position,
  selectionInfo,
  isExpanded,
  onExpand,
  onDismiss,
  type,
  popoverRef,
  className,
  positioning = 'absolute',
  onCopied,
  onAttach,
  onAddAnnotation,
  onUpdateAnnotation,
  annotationMode = 'add',
  initialNote = '',
}) => {
  const [userNote, setUserNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isConfidenceOpen, setIsConfidenceOpen] = useState(false);
  const [lastSelectionInfo, setLastSelectionInfo] = useState<SelectionInfo | null>(null);
  const animationFrameRef = useRef<number>(0);
  const canAttach = type === 'wiki' && typeof onAttach === 'function';
  const canAddPreviewAnnotation = type === 'preview' && typeof onAddAnnotation === 'function';
  const isEditingPreviewAnnotation = type === 'preview' && annotationMode === 'edit';

  // Use the prop if available (active state), otherwise use cached version (exit animation state)
  const displayInfo = selectionInfo || lastSelectionInfo;
  
  // We are active if we are visible and have valid info (either current or cached while rendering)
  // The animation trigger relies on the PROP `isVisible` to know when to enter/exit
  const isActive = isVisible && !!selectionInfo;

  useEffect(() => {
    if (selectionInfo) {
      setLastSelectionInfo(selectionInfo);
      setIsConfidenceOpen(false);
      setUserNote(initialNote);
    }
  }, [initialNote, selectionInfo]);

  useEffect(() => {
    if (isActive) {
      setShouldRender(true);
      setIsAnimatingIn(false);
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = requestAnimationFrame(() => {
          setIsAnimatingIn(true);
        });
      });
    } else {
      // When becoming inactive, start exit animation
      setIsAnimatingIn(false);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive]);

  const handleTransitionEnd = useCallback(() => {
    if (!isActive) {
      setShouldRender(false);
      // Optional: clear cached info after animation is done
      // setLastSelectionInfo(null); 
    }
  }, [isActive]);

  const buildFormattedText = useCallback((includeNote: boolean) => {
    if (!displayInfo) return null;

    const note = includeNote ? userNote : undefined;
    if (type === 'diff') return formatDiffSelectionForAI(displayInfo, note);
    if (type === 'wiki') return formatWikiSelectionForAI(displayInfo, note);
    if (type === 'preview') return formatPreviewSelectionForAI(displayInfo, note);
    return formatEditorSelectionForAI(displayInfo, note);
  }, [displayInfo, type, userNote]);

  const handleCopy = useCallback(async (includeNote: boolean = false) => {
    if (!displayInfo) return;
    const formatted = buildFormattedText(includeNote);
    if (!formatted) return;

    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      toastManager.add({
        title: 'Copied',
        description: 'Selection copied for AI',
        type: 'success',
      });
      onCopied?.({
        type,
        selectionInfo: displayInfo,
        formattedText: formatted,
        includeNote,
      });
      
      setTimeout(() => {
        setCopied(false);
        onDismiss();
        setUserNote('');
      }, 500);
    } catch {
      toastManager.add({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        type: 'error',
      });
    }
  }, [buildFormattedText, displayInfo, onCopied, onDismiss, type]);

  const handleAttach = useCallback(async (includeNote: boolean = false) => {
    if (!displayInfo || !onAttach) return;
    const formatted = buildFormattedText(includeNote);
    if (!formatted) return;

    setAttaching(true);
    try {
      await onAttach({
        type,
        selectionInfo: displayInfo,
        formattedText: formatted,
        includeNote,
      });
      setCopied(false);
      onDismiss();
      setUserNote('');
    } catch {
      // Swallow attach failures to avoid unhandled rejections without adding extra UI noise.
    } finally {
      setAttaching(false);
    }
  }, [buildFormattedText, displayInfo, onAttach, onDismiss, type]);

  const handleQuickCopy = useCallback(() => {
    handleCopy(false);
  }, [handleCopy]);

  const handleCopyWithNote = useCallback(() => {
    handleCopy(true);
  }, [handleCopy]);

  const handleAddAnnotation = useCallback(() => {
    if (!displayInfo || !onAddAnnotation) return;
    onAddAnnotation(displayInfo, userNote);
    setCopied(false);
    setUserNote('');
  }, [displayInfo, onAddAnnotation, userNote]);

  const handleUpdateAnnotation = useCallback(() => {
    if (!displayInfo || !onUpdateAnnotation) return;
    onUpdateAnnotation(displayInfo, userNote);
    setCopied(false);
    setUserNote('');
  }, [displayInfo, onUpdateAnnotation, userNote]);

  if (!shouldRender || !displayInfo) {
    return null;
  }

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

  const detailsContent = (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1 min-w-0 w-full">
        <span 
          className="font-mono flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" 
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
              {displayInfo.changeType}
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
        placeholder="Add a note for the AI agent... (optional)"
        value={userNote}
        onChange={(e) => setUserNote(e.target.value)}
        className="min-h-[80px] text-sm resize-none"
        autoFocus
      />

      {previewDebugSignals.length > 0 || previewSourceConfidence ? (
        <div className="space-y-1">
          <button
            type="button"
            aria-expanded={isConfidenceOpen}
            onClick={() => setIsConfidenceOpen((open) => !open)}
            className="group flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left transition-colors hover:text-foreground"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                  isConfidenceOpen && 'rotate-180',
                )}
              />
              <div className="truncate text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                Source Code Confidence
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {previewSourceConfidence ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]',
                    previewConfidenceLabelClassName,
                  )}
                >
                  {previewSourceConfidence}
                </span>
              ) : null}
            </div>
          </button>
          <div
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
              isConfidenceOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={cn(
                  'rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
                  isConfidenceOpen ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
                )}
              >
                {previewDebugSignals.length > 0
                  ? previewDebugSignals.join(', ')
                  : 'No extra debug signals'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
        >
          Cancel
        </Button>
        {isEditingPreviewAnnotation ? (
          <Button
            size="sm"
            onClick={handleUpdateAnnotation}
            disabled={attaching}
          >
            Update
          </Button>
        ) : (
          <>
        {canAttach ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAttach(true)}
            disabled={attaching}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {attaching ? 'Attaching...' : 'Attach'}
          </Button>
        ) : null}
        {canAddPreviewAnnotation ? (
          <Button
            size="sm"
            onClick={handleAddAnnotation}
            disabled={attaching}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={handleCopyWithNote}
          disabled={attaching}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {canAddPreviewAnnotation ? 'Copy' : 'Copy for AI'}
            </>
          )}
        </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={popoverRef}
      data-selection-popover
      className={cn(positioning === 'fixed' ? 'fixed z-[9999]' : 'absolute z-50', className)}
      style={{
        left: position.x,
        top: position.y,
        opacity: isAnimatingIn ? 1 : 0,
        transform: isAnimatingIn
          ? 'scale(1) translateY(0)'
          : 'scale(0.95) translateY(4px)',
        transition: isAnimatingIn
          ? 'opacity 150ms ease-out, transform 150ms ease-out'
          : 'opacity 150ms ease-in, transform 150ms ease-in',
        pointerEvents: isAnimatingIn ? 'auto' : 'none',
      }}
      onTransitionEnd={handleTransitionEnd}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'preview' ? (
        <div
          data-selection-popover
          className="w-80 rounded-md border border-border bg-popover p-3 shadow-md"
        >
          {detailsContent}
        </div>
      ) : (
        <Popover
        open={isExpanded}
        onOpenChange={(open) => {
          if (open) {
            onExpand();
          } else {
            onDismiss();
          }
        }}
        >
          <PopoverAnchor asChild>
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={canAddPreviewAnnotation ? handleAddAnnotation : handleQuickCopy}
              title={canAddPreviewAnnotation ? "Add annotation" : "Copy for AI"}
            >
              {canAddPreviewAnnotation ? (
                <Plus className="h-3.5 w-3.5" />
              ) : copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            {canAttach ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void handleAttach(false)}
                title="Attach to Agent"
                disabled={attaching}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Add note"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          data-selection-popover
          className="z-[10000] w-80 p-3"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
        >
          {detailsContent}
        </PopoverContent>
      </Popover>
      )}
    </div>
  );
};

export default SelectionPopover;
