'use client';

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Copy, ChevronDown, Check, Paperclip } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
  PopoverTrigger,
  Button,
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
import {
  selectionTypeToAiContextKind,
  wrapAiContextClipboard,
} from '@/shared/lib/ai-context-protocol';
import { SelectionPopoverDetails } from './SelectionPopoverDetails';

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
  /** Host viewport coords for the pick/click anchor (not the card top-left). */
  position: { x: number; y: number };
  selectionInfo: SelectionInfo | null;
  isExpanded: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  type: SelectionType;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  /**
   * Legacy: absolute vs fixed for non-preview chrome.
   * Preview always uses Radix Popover portaled to body, anchored at `position`.
   */
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
  const t = useTranslations('Selection.components');
  const [userNote, setUserNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [lastSelectionInfo, setLastSelectionInfo] = useState<SelectionInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const canAttach = type === 'wiki' && typeof onAttach === 'function';
  const canAddPreviewAnnotation = type === 'preview' && typeof onAddAnnotation === 'function';
  const isEditingPreviewAnnotation = type === 'preview' && annotationMode === 'edit';
  const isPreview = type === 'preview';

  const displayInfo = selectionInfo || lastSelectionInfo;
  const isActive = isVisible && !!selectionInfo;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectionInfo) {
      setLastSelectionInfo(selectionInfo);
      setUserNote(initialNote);
    }
  }, [initialNote, selectionInfo]);

  // Keep the body-level anchor in sync when host remaps click coords (scroll/zoom).
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    el.style.left = `${Math.round(position.x)}px`;
    el.style.top = `${Math.round(position.y)}px`;
  }, [position.x, position.y, isActive]);

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
    const clipboardText = wrapAiContextClipboard(
      selectionTypeToAiContextKind(type),
      formatted,
    );

    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopied(true);
      toastManager.add({
        title: t('popover.toast.copiedTitle'),
        description: t('popover.toast.copiedDescription'),
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
        title: t('popover.toast.failedToCopyTitle'),
        description: t('popover.toast.failedToCopyDescription'),
        type: 'error',
      });
    }
  }, [buildFormattedText, displayInfo, onCopied, onDismiss, t, type]);

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
      // Swallow attach failures.
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

  if (!displayInfo || !isActive) {
    return null;
  }

  const detailsContent = (
    <SelectionPopoverDetails
      displayInfo={displayInfo}
      type={type}
      userNote={userNote}
      copied={copied}
      attaching={attaching}
      canAttach={canAttach}
      canAddPreviewAnnotation={canAddPreviewAnnotation}
      isEditingPreviewAnnotation={isEditingPreviewAnnotation}
      onUserNoteChange={setUserNote}
      onDismiss={onDismiss}
      onAttachWithNote={() => void handleAttach(true)}
      onAddAnnotation={handleAddAnnotation}
      onCopyWithNote={handleCopyWithNote}
      onUpdateAnnotation={handleUpdateAnnotation}
    />
  );

  // Browser element select: both anchor + content live on document.body so
  // viewport-space click coords match Floating UI measurements (no transform
  // ancestor skew). Key remounts positioning when the click point jumps.
  if (isPreview) {
    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(
      <Popover
        open={isActive}
        onOpenChange={(open) => {
          if (!open) onDismiss();
        }}
      >
        <PopoverAnchor asChild>
          <span
            ref={anchorRef}
            aria-hidden
            data-selection-popover-anchor
            // 2×2 hit box — 0×0 anchors are flaky for Floating UI.
            className="pointer-events-none fixed z-[9998] block size-0.5 overflow-hidden opacity-0"
            style={{
              left: Math.round(position.x),
              top: Math.round(position.y),
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          ref={popoverRef as React.Ref<HTMLDivElement>}
          data-selection-popover
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          avoidCollisions
          // Do not use sticky — sticky keeps the panel viewport-fixed while the
          // page scrolls and covers unrelated content.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const root = e.currentTarget;
            if (!(root instanceof HTMLElement)) return;
            const note = root.querySelector('textarea');
            if (note instanceof HTMLTextAreaElement) {
              note.focus({ preventScroll: true });
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'z-[10000] w-80 max-h-[min(420px,calc(100vh-24px))] overflow-y-auto p-3',
            className,
          )}
        >
          {detailsContent}
        </PopoverContent>
      </Popover>,
      document.body,
    );
  }

  return (
    <div
      ref={popoverRef}
      data-selection-popover
      className={cn(positioning === 'fixed' ? 'fixed z-[9999]' : 'absolute z-50', className)}
      style={{
        left: position.x,
        top: position.y,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
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
              onClick={handleQuickCopy}
              title={t('popover.actions.copyForAi')}
            >
              {copied ? (
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
                title={t('popover.actions.attachToAgent')}
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
                title={t('popover.actions.addNote')}
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          avoidCollisions
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
    </div>
  );
};

export default SelectionPopover;
