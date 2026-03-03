'use client';

import { useState, useCallback, useEffect, useRef, RefObject } from 'react';
import type { SelectionInfo } from '@/lib/format-selection-for-ai';

export type { SelectionInfo };

export type GetSelectionInfoFn = () => SelectionInfo | null;

export interface UseSelectionPopoverOptions {
  getSelectionInfo: GetSelectionInfoFn;
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  useDocumentEvents?: boolean; // For Shadow DOM scenarios like DiffViewer
}

export interface UseSelectionPopoverReturn {
  isVisible: boolean;
  position: { x: number; y: number };
  selectionInfo: SelectionInfo | null;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  dismiss: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
}

export function useSelectionPopover({
  getSelectionInfo,
  containerRef,
  enabled = true,
  useDocumentEvents = false,
}: UseSelectionPopoverOptions): UseSelectionPopoverReturn {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const isInteractingWithPopover = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const pendingSelectionInfo = useRef<SelectionInfo | null>(null);

  const isPopoverInteractionTarget = useCallback((target: EventTarget | null): boolean => {
    if (!target) return false;
    if (target instanceof Node && popoverRef.current?.contains(target)) return true;
    if (!(target instanceof Element)) return false;
    return (
      !!target.closest('[data-selection-popover]') ||
      !!target.closest('[data-radix-popper-content-wrapper]') ||
      !!target.closest('[data-slot="popover-content"]')
    );
  }, []);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    setIsExpanded(false);
    setSelectionInfo(null);
  }, []);

  // Track mouse position for positioning popover
  const handleMouseMove = useCallback((event: MouseEvent) => {
    lastMousePosition.current = { x: event.clientX, y: event.clientY };
  }, []);

  // For Shadow DOM: capture selection info during selectionchange
  const handleSelectionChange = useCallback(() => {
    if (!enabled || !useDocumentEvents) return;
    
    const info = getSelectionInfo();
    if (info && info.selectedText.trim().length > 0) {
      pendingSelectionInfo.current = info;
    }
  }, [enabled, useDocumentEvents, getSelectionInfo]);

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!enabled) return;

    const target = event.target;
    const container = containerRef.current;
    
    // For document events (Shadow DOM), check if event is within container bounds
    if (useDocumentEvents && container) {
      const rect = container.getBoundingClientRect();
      const isInBounds = (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
      if (!isInBounds) {
        return;
      }
    }
    
    // Check if interacting with popover (including Portal-rendered content)
    if (isPopoverInteractionTarget(target)) {
      isInteractingWithPopover.current = true;
      return;
    }

    // If we were interacting with popover, don't create new one
    if (isInteractingWithPopover.current) {
      isInteractingWithPopover.current = false;
      return;
    }

    // Small delay to let selection finalize
    setTimeout(() => {
      // For Shadow DOM, use pending selection info captured during selectionchange
      const info = useDocumentEvents ? pendingSelectionInfo.current : getSelectionInfo();
      
      if (info && info.selectedText.trim().length > 0) {
        if (container) {
          const rect = container.getBoundingClientRect();
          setPosition({
            x: Math.min(event.clientX - rect.left, rect.width - 150),
            y: event.clientY - rect.top + 10,
          });
        } else {
          setPosition({
            x: event.clientX,
            y: event.clientY + 10,
          });
        }
        
        setSelectionInfo(info);
        setIsVisible(true);
        setIsExpanded(false);
      }
      
      // Clear pending info
      pendingSelectionInfo.current = null;
    }, 10);
  }, [enabled, getSelectionInfo, containerRef, isPopoverInteractionTarget, useDocumentEvents]);

  const handleMouseDown = useCallback((event: MouseEvent) => {
    const target = event.target;
    
    // Check if click is inside the popover (including Portal-rendered content)
    if (isPopoverInteractionTarget(target)) {
      isInteractingWithPopover.current = true;
      return;
    }
    
    // Dismiss on mouse down outside popover (new selection starting)
    if (isVisible) {
      dismiss();
    }
  }, [dismiss, isPopoverInteractionTarget, isVisible]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isVisible) {
      dismiss();
    }
  }, [dismiss, isVisible]);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!useDocumentEvents && !container) return;

    if (useDocumentEvents) {
      // For Shadow DOM scenarios, listen on document
      document.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('mousedown', handleMouseDown, true);
      document.addEventListener('selectionchange', handleSelectionChange);
      document.addEventListener('mousemove', handleMouseMove, true);
    } else if (container) {
      // Use capture phase to catch events before they reach the editor
      container.addEventListener('mouseup', handleMouseUp, true);
      container.addEventListener('mousedown', handleMouseDown, true);
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (useDocumentEvents) {
        document.removeEventListener('mouseup', handleMouseUp, true);
        document.removeEventListener('mousedown', handleMouseDown, true);
        document.removeEventListener('selectionchange', handleSelectionChange);
        document.removeEventListener('mousemove', handleMouseMove, true);
      } else if (container) {
        container.removeEventListener('mouseup', handleMouseUp, true);
        container.removeEventListener('mousedown', handleMouseDown, true);
      }
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, containerRef, handleMouseUp, handleMouseDown, handleKeyDown, handleSelectionChange, handleMouseMove, useDocumentEvents]);

  return {
    isVisible,
    position,
    selectionInfo,
    isExpanded,
    setIsExpanded,
    dismiss,
    popoverRef,
  };
}
