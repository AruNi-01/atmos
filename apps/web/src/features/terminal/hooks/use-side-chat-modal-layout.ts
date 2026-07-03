"use client";

import React from "react";

export type SideChatResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type SideChatModalLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SideChatModalBounds = {
  width: number;
  height: number;
};

interface UseSideChatModalLayoutOptions {
  overlayRef: React.RefObject<HTMLDivElement | null>;
  onInteraction?: (event: Event | React.SyntheticEvent) => void;
}

const SIDE_CHAT_MODAL_DEFAULT_WIDTH = 900;
const SIDE_CHAT_MODAL_DEFAULT_HEIGHT = 560;
const SIDE_CHAT_MODAL_MIN_WIDTH = 360;
const SIDE_CHAT_MODAL_MIN_HEIGHT = 260;

export function useSideChatModalLayout({
  overlayRef,
  onInteraction,
}: UseSideChatModalLayoutOptions) {
  const resizeAbortControllerRef = React.useRef<AbortController | null>(null);
  const dragAbortControllerRef = React.useRef<AbortController | null>(null);
  const restoreBodyInteractionStylesRef = React.useRef<(() => void) | null>(null);
  const resizeStateRef = React.useRef<{
    startX: number;
    startY: number;
    original: SideChatModalLayout;
    edge: SideChatResizeEdge;
  } | null>(null);
  const dragStateRef = React.useRef<{
    startX: number;
    startY: number;
    original: SideChatModalLayout;
    moved: boolean;
  } | null>(null);
  const suppressNextHeaderClickRef = React.useRef(false);
  const [layout, setLayout] = React.useState<SideChatModalLayout | null>(null);

  const markInteraction = React.useCallback(
    (event: Event | React.SyntheticEvent) => {
      onInteraction?.(event);
    },
    [onInteraction],
  );

  const restoreBodyInteractionStyles = React.useCallback(() => {
    restoreBodyInteractionStylesRef.current?.();
    restoreBodyInteractionStylesRef.current = null;
  }, []);

  const setBodyInteractionStyles = React.useCallback(
    ({ cursor, userSelect }: { cursor?: string; userSelect?: string }) => {
      restoreBodyInteractionStyles();
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      if (cursor !== undefined) document.body.style.cursor = cursor;
      if (userSelect !== undefined) document.body.style.userSelect = userSelect;
      restoreBodyInteractionStylesRef.current = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      };
    },
    [restoreBodyInteractionStyles],
  );

  React.useLayoutEffect(() => {
    const node = overlayRef.current;
    if (!node) return;

    const syncLayout = () => {
      const bounds = readSideChatModalBounds(node);
      setLayout((current) => {
        const next = current
          ? clampSideChatModalLayout(current, bounds)
          : createInitialSideChatModalLayout(bounds);
        return sideChatModalLayoutsEqual(current, next) ? current : next;
      });
    };

    syncLayout();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncLayout);
      return () => window.removeEventListener("resize", syncLayout);
    }

    const resizeObserver = new ResizeObserver(syncLayout);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [overlayRef]);

  React.useEffect(() => {
    return () => {
      resizeAbortControllerRef.current?.abort();
      resizeAbortControllerRef.current = null;
      dragAbortControllerRef.current?.abort();
      dragAbortControllerRef.current = null;
      restoreBodyInteractionStyles();
    };
  }, [restoreBodyInteractionStyles]);

  const handleResizeStart = React.useCallback(
    (edge: SideChatResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
      const overlay = overlayRef.current;
      if (event.button !== 0 || !overlay || !layout) return;

      markInteraction(event);
      event.preventDefault();
      event.stopPropagation();
      resizeAbortControllerRef.current?.abort();
      restoreBodyInteractionStyles();

      resizeStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        original: layout,
        edge,
      };

      setBodyInteractionStyles({
        cursor: sideChatModalResizeCursor(edge),
        userSelect: "none",
      });

      const finishResize = (finishEvent?: PointerEvent) => {
        if (finishEvent) {
          markInteraction(finishEvent);
        }
        resizeStateRef.current = null;
        resizeAbortControllerRef.current?.abort();
        resizeAbortControllerRef.current = null;
        restoreBodyInteractionStyles();
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const state = resizeStateRef.current;
        const currentOverlay = overlayRef.current;
        if (!state || !currentOverlay) return;
        markInteraction(moveEvent);

        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;
        setLayout(
          resizeSideChatModalLayout(
            state.original,
            state.edge,
            dx,
            dy,
            readSideChatModalBounds(currentOverlay),
          ),
        );
      };

      resizeAbortControllerRef.current = new AbortController();
      const { signal } = resizeAbortControllerRef.current;
      document.addEventListener("pointermove", handlePointerMove, { capture: true, signal });
      document.addEventListener("pointerup", finishResize, { capture: true, signal });
      document.addEventListener("pointercancel", finishResize, { capture: true, signal });
    },
    [layout, markInteraction, overlayRef, restoreBodyInteractionStyles, setBodyInteractionStyles],
  );

  const handleDragStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const overlay = overlayRef.current;
      if (event.button !== 0 || !overlay || !layout) return;
      if ((event.target as HTMLElement | null)?.closest("[data-side-chat-control='true']")) return;

      markInteraction(event);
      event.stopPropagation();
      dragAbortControllerRef.current?.abort();
      restoreBodyInteractionStyles();
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        original: layout,
        moved: false,
      };

      const finishDrag = (finishEvent?: PointerEvent) => {
        if (finishEvent) {
          markInteraction(finishEvent);
        }
        dragStateRef.current = null;
        dragAbortControllerRef.current?.abort();
        dragAbortControllerRef.current = null;
        restoreBodyInteractionStyles();
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const state = dragStateRef.current;
        const currentOverlay = overlayRef.current;
        if (!state || !currentOverlay) return;
        markInteraction(moveEvent);

        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;
        if (!state.moved && Math.hypot(dx, dy) < 3) return;

        if (!state.moved) {
          state.moved = true;
          suppressNextHeaderClickRef.current = true;
          setBodyInteractionStyles({ cursor: "grabbing", userSelect: "none" });
        }
        setLayout(
          clampSideChatModalLayout(
            { ...state.original, x: state.original.x + dx, y: state.original.y + dy },
            readSideChatModalBounds(currentOverlay),
          ),
        );
      };

      dragAbortControllerRef.current = new AbortController();
      const { signal } = dragAbortControllerRef.current;
      document.addEventListener("pointermove", handlePointerMove, { capture: true, signal });
      document.addEventListener("pointerup", finishDrag, { capture: true, signal });
      document.addEventListener("pointercancel", finishDrag, { capture: true, signal });
    },
    [layout, markInteraction, overlayRef, restoreBodyInteractionStyles, setBodyInteractionStyles],
  );

  const modalStyle: React.CSSProperties = layout
    ? {
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
      }
    : {
        left: "50%",
        top: "50%",
        width: "min(900px, 100%)",
        height: "min(560px, 100%)",
        transform: "translate(-50%, -50%)",
      };

  return {
    handleDragStart,
    handleResizeStart,
    markInteraction,
    modalStyle,
    suppressNextHeaderClickRef,
  };
}

function readSideChatModalBounds(node: HTMLElement): SideChatModalBounds {
  const rect = node.getBoundingClientRect();
  return {
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
}

function createInitialSideChatModalLayout(bounds: SideChatModalBounds): SideChatModalLayout {
  const width = Math.min(SIDE_CHAT_MODAL_DEFAULT_WIDTH, bounds.width);
  const height = Math.min(SIDE_CHAT_MODAL_DEFAULT_HEIGHT, bounds.height);
  return {
    x: Math.max(0, Math.round((bounds.width - width) / 2)),
    y: Math.max(0, Math.round((bounds.height - height) / 2)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function clampSideChatModalLayout(
  layout: SideChatModalLayout,
  bounds: SideChatModalBounds,
): SideChatModalLayout {
  const maxWidth = Math.max(0, bounds.width);
  const maxHeight = Math.max(0, bounds.height);
  const minWidth = Math.min(SIDE_CHAT_MODAL_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(SIDE_CHAT_MODAL_MIN_HEIGHT, maxHeight);
  const width = clampNumber(layout.width, minWidth, maxWidth);
  const height = clampNumber(layout.height, minHeight, maxHeight);
  const x = clampNumber(layout.x, 0, Math.max(0, maxWidth - width));
  const y = clampNumber(layout.y, 0, Math.max(0, maxHeight - height));

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function resizeSideChatModalLayout(
  layout: SideChatModalLayout,
  edge: SideChatResizeEdge,
  dx: number,
  dy: number,
  bounds: SideChatModalBounds,
): SideChatModalLayout {
  const horizontal = resizeSideChatModalAxis({
    delta: dx,
    direction: edge.includes("w") ? "start" : edge.includes("e") ? "end" : null,
    minSize: Math.min(SIDE_CHAT_MODAL_MIN_WIDTH, bounds.width),
    position: layout.x,
    size: layout.width,
    trackSize: bounds.width,
  });
  const vertical = resizeSideChatModalAxis({
    delta: dy,
    direction: edge.includes("n") ? "start" : edge.includes("s") ? "end" : null,
    minSize: Math.min(SIDE_CHAT_MODAL_MIN_HEIGHT, bounds.height),
    position: layout.y,
    size: layout.height,
    trackSize: bounds.height,
  });

  return clampSideChatModalLayout(
    {
      x: horizontal.position,
      y: vertical.position,
      width: horizontal.size,
      height: vertical.size,
    },
    bounds,
  );
}

function sideChatModalResizeCursor(edge: SideChatResizeEdge): string {
  if (edge === "n" || edge === "s") return `${edge}-resize`;
  if (edge === "e" || edge === "w") return `${edge}-resize`;
  return `${edge}-resize`;
}

function sideChatModalLayoutsEqual(
  a: SideChatModalLayout | null,
  b: SideChatModalLayout,
): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function clampNumber(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

function resizeSideChatModalAxis({
  delta,
  direction,
  minSize,
  position,
  size,
  trackSize,
}: {
  delta: number;
  direction: "start" | "end" | null;
  minSize: number;
  position: number;
  size: number;
  trackSize: number;
}): { position: number; size: number } {
  if (direction === "end") {
    const maxSize = Math.max(0, trackSize - position);
    return {
      position,
      size: clampNumber(size + delta, minSize, maxSize),
    };
  }

  if (direction === "start") {
    const fixedEnd = position + size;
    const maxSize = Math.max(0, fixedEnd);
    const nextSize = clampNumber(size - delta, minSize, maxSize);
    return {
      position: fixedEnd - nextSize,
      size: nextSize,
    };
  }

  return { position, size };
}
