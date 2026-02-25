'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from '@workspace/ui';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useAgentChatLayout } from '@/hooks/use-agent-chat-layout';

const BALL_SIZE = 36;
const HALF = BALL_SIZE / 2;

type Edge = 'left' | 'right' | 'top' | 'bottom';

function snapToEdge(x: number, y: number, vw: number, vh: number): { x: number; y: number; edge: Edge } {
  const distLeft = x + HALF;
  const distRight = vw - x - HALF;
  const distTop = y + HALF;
  const distBottom = vh - y - HALF;
  const min = Math.min(distLeft, distRight, distTop, distBottom);

  if (min === distLeft) return { x: -HALF, y: Math.max(0, Math.min(y, vh - BALL_SIZE)), edge: 'left' };
  if (min === distRight) return { x: vw - HALF, y: Math.max(0, Math.min(y, vh - BALL_SIZE)), edge: 'right' };
  if (min === distTop) return { x: Math.max(0, Math.min(x, vw - BALL_SIZE)), y: -HALF, edge: 'top' };
  return { x: Math.max(0, Math.min(x, vw - BALL_SIZE)), y: vh - HALF, edge: 'bottom' };
}

export function AgentFloatingBall() {
  const { layout, updateLayout, loadLayout, loaded: layoutLoaded } = useAgentChatLayout();
  const { isAgentChatOpen, setAgentChatOpen } = useDialogStore();
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Logical center of the ball (used for snapping calculation)
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => { loadLayout(); }, [loadLayout]);

  // Initialize position from persisted layout or default (wait for layout to load)
  useEffect(() => {
    if (initializedRef.current || !layoutLoaded || typeof window === 'undefined') return;
    if (layout.ballX >= 0 && layout.ballY >= 0) {
      // Restore from persisted position
      setCenter({ x: layout.ballX, y: layout.ballY });
    } else {
      // First time — default to right edge, 60% height
      setCenter({ x: window.innerWidth, y: Math.round(window.innerHeight * 0.6) });
    }
    initializedRef.current = true;
  }, [layoutLoaded, layout.ballX, layout.ballY]);

  // Reset hover when chat opens (so ball is snapped when chat closes)
  useEffect(() => {
    if (isAgentChatOpen) {
      setHovered(false);
    }
  }, [isAgentChatOpen]);

  const getViewport = () => ({
    vw: typeof window !== 'undefined' ? window.innerWidth : 1920,
    vh: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!center) return;
    const { vw, vh } = getViewport();
    // Start dragging from the snapped (visible) position
    const snapped = snapToEdge(center.x, center.y, vw, vh);
    const startCenter = { x: snapped.x + HALF, y: snapped.y + HALF };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: startCenter.x, origY: startCenter.y, moved: false };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragRef.current.moved = true;
        setDragging(true);
      }
      if (dragRef.current.moved) {
        const newCenter = {
          x: dragRef.current.origX + dx,
          y: dragRef.current.origY + dy,
        };
        setCenter(newCenter);
      }
    };
    const handleUp = () => {
      const wasDrag = dragRef.current?.moved;
      dragRef.current = null;
      setDragging(false);
      setHovered(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (!wasDrag) {
        setAgentChatOpen(true);
      }
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [center, setAgentChatOpen]);

  // Persist position after dragging ends
  useEffect(() => {
    if (!dragging && center && initializedRef.current) {
      updateLayout({ ballX: center.x, ballY: center.y });
    }
    // Only persist when dragging ends, not on every center change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  if (!layout.floatingBall || isAgentChatOpen || !center) return null;

  const { vw, vh } = getViewport();
  const snapped = snapToEdge(center.x, center.y, vw, vh);

  // When hovered: slide out from the snapped edge only (straight, not diagonal)
  // When dragging: follow cursor freely
  const isExpanded = hovered || dragging;
  let displayX: number;
  let displayY: number;
  if (dragging) {
    displayX = Math.max(0, Math.min(center.x - HALF, vw - BALL_SIZE));
    displayY = Math.max(0, Math.min(center.y - HALF, vh - BALL_SIZE));
  } else if (hovered) {
    // Only move along the edge axis, keep the other axis unchanged
    if (snapped.edge === 'left') { displayX = 0; displayY = snapped.y; }
    else if (snapped.edge === 'right') { displayX = vw - BALL_SIZE; displayY = snapped.y; }
    else if (snapped.edge === 'top') { displayX = snapped.x; displayY = 0; }
    else { displayX = snapped.x; displayY = vh - BALL_SIZE; }
  } else {
    displayX = snapped.x;
    displayY = snapped.y;
  }

  return (
    <div
      className="fixed z-50 flex items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg backdrop-blur-sm cursor-pointer select-none"
      style={{
        width: BALL_SIZE,
        height: BALL_SIZE,
        left: displayX,
        top: displayY,
        transition: dragging ? 'none' : 'left 0.3s ease, top 0.3s ease, opacity 0.2s ease',
        opacity: isExpanded ? 1 : 0.6,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Bot className="size-4" />
    </div>
  );
}
