'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, ChevronDown, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
  Button,
  Textarea,
  cn,
  toastManager,
} from '@workspace/ui';
import type { SelectionInfo } from '@/lib/format-selection-for-ai';
import {
  formatEditorSelectionForAI,
  formatDiffSelectionForAI,
  formatWikiSelectionForAI,
} from '@/lib/format-selection-for-ai';

export type SelectionType = 'editor' | 'diff' | 'wiki';

export interface SelectionCopiedPayload {
  type: SelectionType;
  selectionInfo: SelectionInfo;
  formattedText: string;
  includeNote: boolean;
}

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
}) => {
  const [userNote, setUserNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [lastSelectionInfo, setLastSelectionInfo] = useState<SelectionInfo | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Keep track of the last valid selection info for the exit animation
  if (selectionInfo && selectionInfo !== lastSelectionInfo) {
    setLastSelectionInfo(selectionInfo);
  }

  // Use the prop if available (active state), otherwise use cached version (exit animation state)
  const displayInfo = selectionInfo || lastSelectionInfo;
  
  // We are active if we are visible and have valid info (either current or cached while rendering)
  // The animation trigger relies on the PROP `isVisible` to know when to enter/exit
  const isActive = isVisible && !!selectionInfo;

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

  const handleCopy = useCallback(async (includeNote: boolean = false) => {
    if (!displayInfo) return;

    const note = includeNote ? userNote : undefined;
    const formatted = (() => {
      if (type === 'diff') return formatDiffSelectionForAI(displayInfo, note);
      if (type === 'wiki') return formatWikiSelectionForAI(displayInfo, note);
      return formatEditorSelectionForAI(displayInfo, note);
    })();

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
  }, [displayInfo, onCopied, onDismiss, type, userNote]);

  const handleQuickCopy = useCallback(() => {
    handleCopy(false);
  }, [handleCopy]);

  const handleCopyWithNote = useCallback(() => {
    handleCopy(true);
  }, [handleCopy]);

  if (!shouldRender || !displayInfo) {
    return null;
  }

  const lineRange = displayInfo.startLine > 0
    ? (displayInfo.startLine === displayInfo.endLine
      ? `L${displayInfo.startLine}`
      : `L${displayInfo.startLine}-L${displayInfo.endLine}`)
    : null;

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
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <Popover open={isExpanded} onOpenChange={(open) => !open && onDismiss()}>
        <PopoverAnchor asChild>
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleQuickCopy}
              title="Copy for AI"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onExpand}
              title="Add note"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-80 p-3"
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
        >
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
            </div>

            <Textarea
              placeholder="Add a note for the AI agent... (optional)"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="min-h-[80px] text-sm resize-none"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCopyWithNote}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy for AI
                  </>
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default SelectionPopover;
