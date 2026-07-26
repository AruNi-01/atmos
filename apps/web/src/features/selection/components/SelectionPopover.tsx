'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  const t = useTranslations('Selection.components');
  const [userNote, setUserNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
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
