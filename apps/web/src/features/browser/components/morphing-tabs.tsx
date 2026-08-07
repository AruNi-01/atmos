"use client";
// Adapted from beui.dev Morphing Tabs (MIT) — compact chrome density for Atmos browser.
// https://beui.dev/components/blocks/morphing-tabs

import { Plus, X } from "lucide-react";
import {
  animate as animateValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";

import { SPRING_GLIDE } from "../lib/morphing-ease";

export type MorphingTabsItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type MorphingTabsClassNames = {
  root?: string;
  rail?: string;
  tab?: string;
  activeTab?: string;
  icon?: string;
  label?: string;
  close?: string;
  content?: string;
};

export interface MorphingTabsProps {
  items: MorphingTabsItem[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Called once after a pointer drag or keyboard reorder completes. */
  onOrderChange?: (ids: string[]) => void;
  /** Enables the close affordance on every tab when provided. */
  onClose?: (id: string) => void;
  /** When false, close is hidden even if onClose is set (e.g. last tab). */
  canClose?: boolean | ((id: string) => boolean);
  closeAriaLabel?: (label: string) => string;
  /** New-tab control — sits after the last tab until the strip overflows. */
  onAdd?: () => void;
  addAriaLabel?: string;
  ariaLabel?: string;
  className?: string;
  classNames?: MorphingTabsClassNames;
  /** Shared content surface — stays mounted across tab switches (browser viewports). */
  children?: ReactNode;
  /** Fixed rail chrome (favorites / overflow) — never scrolls with tabs. */
  trailing?: ReactNode;
  /** Extra left inset for macOS traffic lights / window chrome. */
  railInsetLeft?: number;
  railProps?: React.HTMLAttributes<HTMLDivElement> & {
    "data-tauri-drag-region"?: string;
  };
}

type DragSession = {
  id: string;
  pointerId: number;
  originX: number;
  startLeft: number;
  startIndex: number;
  targetIndex: number;
  moved: boolean;
  finishing: boolean;
  startOrder: string[];
  slotLefts: number[];
};

type SpringTabProps = {
  id: string;
  targetLeft: number;
  dragging: boolean;
  dragLeft: MotionValue<number>;
  surfaceLeft: MotionValue<number>;
  reduce: boolean;
  active: boolean;
  anyDragging: boolean;
  surfaceHost: HTMLDivElement | null;
  surfaceWidth: number;
  contentInset: number;
  tabWidth: number;
  surfaceClassName?: string;
  zIndex: number;
  className: string;
  children: ReactNode;
  registerPosition: (id: string, position: MotionValue<number> | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/** Dense browser chrome — aligned with previous h-8 strip / h-7 tabs. */
const DRAG_THRESHOLD = 5;
const TAB_WIDTH = 156;
const TAB_MIN_WIDTH = 96;
const TAB_HEIGHT = 28;
const TAB_TOP = 4;
const TAB_RADIUS = 10;
const RAIL_HEIGHT = 32;
const LIQUID_JOIN = 12;
const PANEL_RADIUS = 12;
const DEFAULT_TAB_GAP = 4;
const ADD_BUTTON_SIZE = 24;
const ADD_BUTTON_GAP = 4;
const TRAILING_GAP = 6;

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function moveItem(order: string[], from: number, to: number) {
  if (from === to) return order.slice();
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Active tab silhouette only: rounded top + liquid ears into the content edge.
 * Deliberately does NOT span the full content width.
 */
function liquidTabPath(
  tabLeft: number,
  surfaceWidth: number,
  contentInset: number,
  tabWidth: number,
) {
  const panelLeft = contentInset;
  const panelRight = Math.max(panelLeft + tabWidth, surfaceWidth - contentInset);
  const left = Math.max(panelLeft, Math.min(panelRight - tabWidth, tabLeft));
  const right = left + tabWidth;
  const top = RAIL_HEIGHT - TAB_HEIGHT;
  const bottom = RAIL_HEIGHT;
  const leftJoin = Math.max(panelLeft, left - LIQUID_JOIN);
  const rightJoin = Math.min(panelRight, right + LIQUID_JOIN);
  const leftDepth = Math.min(LIQUID_JOIN, left - leftJoin);
  const rightDepth = Math.min(LIQUID_JOIN, rightJoin - right);
  const leftControl = leftDepth * 0.55;
  const rightControl = rightDepth * 0.55;
  const dip = Math.min(PANEL_RADIUS, 8);

  return [
    `M${leftJoin} ${bottom + dip}`,
    `L${leftJoin} ${bottom}`,
    `C${leftJoin + leftControl} ${bottom} ${left} ${bottom - leftDepth + leftControl} ${left} ${bottom - leftDepth}`,
    `V${top + TAB_RADIUS}`,
    `Q${left} ${top} ${left + TAB_RADIUS} ${top}`,
    `H${right - TAB_RADIUS}`,
    `Q${right} ${top} ${right} ${top + TAB_RADIUS}`,
    `V${bottom - rightDepth}`,
    `C${right} ${bottom - rightDepth + rightControl} ${rightJoin - rightControl} ${bottom} ${rightJoin} ${bottom}`,
    `L${rightJoin} ${bottom + dip}`,
    "Z",
  ].join(" ");
}

function SpringTab({
  id,
  targetLeft,
  dragging,
  dragLeft,
  surfaceLeft,
  reduce,
  active,
  anyDragging,
  surfaceHost,
  surfaceWidth,
  contentInset,
  tabWidth,
  surfaceClassName,
  zIndex,
  className,
  children,
  registerPosition,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: SpringTabProps) {
  const target = useMotionValue(targetLeft);
  const position = useSpring(target, SPRING_GLIDE);
  const settledTransform = useTransform(
    reduce ? target : position,
    (left) => `translate3d(${left}px, 0, 0)`,
  );
  const draggedTransform = useTransform(
    dragLeft,
    (left) => `translate3d(${left}px, 0, 0)`,
  );

  useLayoutEffect(() => {
    // Layout reflows (compress / add / resize): jump so left tabs don't spring-slide.
    // Mid-drag sibling displacement still springs via target.
    if (reduce || !anyDragging) {
      target.set(targetLeft);
      position.jump(targetLeft);
    } else {
      target.set(targetLeft);
    }
  }, [anyDragging, position, reduce, target, targetLeft]);

  useLayoutEffect(() => {
    registerPosition(id, position);
    return () => registerPosition(id, null);
  }, [id, position, registerPosition]);

  const liquidDriver = anyDragging
    ? dragging
      ? dragLeft
      : position
    : surfaceLeft;

  return (
    <>
      {active && surfaceHost && surfaceWidth > contentInset * 2
        ? createPortal(
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox={`0 0 ${surfaceWidth} ${RAIL_HEIGHT + PANEL_RADIUS}`}
              preserveAspectRatio="none"
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-[15] h-11 w-full text-background",
                surfaceClassName,
              )}
            >
              <LiquidSurfacePath
                key={
                  anyDragging
                    ? dragging
                      ? "dragged"
                      : "displaced"
                    : "idle"
                }
                left={liquidDriver}
                surfaceWidth={surfaceWidth}
                contentInset={contentInset}
                tabWidth={tabWidth}
              />
            </svg>,
            surfaceHost,
          )
        : null}
      <motion.div
        style={{
          zIndex,
          transform: dragging ? draggedTransform : settledTransform,
        }}
        className={className}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
      >
        {children}
      </motion.div>
    </>
  );
}

function LiquidSurfacePath({
  left,
  surfaceWidth,
  contentInset,
  tabWidth,
}: {
  left: MotionValue<number>;
  surfaceWidth: number;
  contentInset: number;
  tabWidth: number;
}) {
  const path = useTransform(left, (value) =>
    liquidTabPath(value, surfaceWidth, contentInset, tabWidth),
  );
  return <motion.path d={path} fill="currentColor" />;
}

function AddTabButton({
  ariaLabel,
  onClick,
  className,
  style,
}: {
  ariaLabel: string;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      style={style}
      className={cn(
        "desktop-no-drag flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground",
        className,
      )}
    >
      <Plus className="size-3.5" />
    </button>
  );
}

export function MorphingTabs({
  items,
  value,
  defaultValue,
  onValueChange,
  onOrderChange,
  onClose,
  canClose = true,
  closeAriaLabel,
  onAdd,
  addAriaLabel = "New tab",
  ariaLabel = "Tabs",
  className,
  classNames,
  children,
  trailing,
  railInsetLeft = 0,
  railProps,
}: MorphingTabsProps) {
  const reduce = Boolean(useReducedMotion());
  const uid = useId();
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const [order, setOrder] = useState(itemIds);
  const orderRef = useRef(order);
  orderRef.current = order;

  const [internalValue, setInternalValue] = useState<string | null>(
    defaultValue ?? itemIds[0] ?? null,
  );
  const controlled = value !== undefined;
  const currentValue = controlled ? (value ?? null) : internalValue;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackEl, setTrackEl] = useState<HTMLDivElement | null>(null);
  const trailingRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabPositionRefs = useRef<Record<string, MotionValue<number> | null>>(
    {},
  );
  const dragRef = useRef<DragSession | null>(null);
  const dragAnimationRef = useRef<ReturnType<typeof animateValue> | null>(null);
  const surfaceAnimationRef = useRef<ReturnType<typeof animateValue> | null>(
    null,
  );

  const [trackWidth, setTrackWidth] = useState(0);
  const [tabGap] = useState(DEFAULT_TAB_GAP);
  const [tabWidth, setTabWidth] = useState(TAB_WIDTH);
  const [pinAdd, setPinAdd] = useState(false);
  const [scrollPortWidth, setScrollPortWidth] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState(-1);
  const dragLeft = useMotionValue(0);
  const surfaceLeft = useMotionValue(0);

  // Tabs always start at x=0 inside the scroll track (traffic lights pad the rail).
  const contentInset = 0;

  useEffect(() => {
    setOrder((current) => {
      const available = new Set(itemIds);
      const retained = current.filter((id) => available.has(id));
      const retainedSet = new Set(retained);
      const added = itemIds.filter((id) => !retainedSet.has(id));
      const next = [...retained, ...added];
      return sameOrder(current, next) ? current : next;
    });
  }, [itemIds]);

  const orderedItems = useMemo(
    () =>
      order.flatMap((id) => {
        const item = itemMap.get(id);
        return item ? [item] : [];
      }),
    [itemMap, order],
  );

  const firstEnabledItem =
    orderedItems.find((item) => !item.disabled) ?? orderedItems[0] ?? null;
  const activeItem =
    currentValue && itemMap.has(currentValue)
      ? itemMap.get(currentValue) ?? null
      : firstEnabledItem;
  const activeId = activeItem?.id ?? null;

  const count = orderedItems.length;
  const tabsSpan =
    count <= 0 ? 0 : count * tabWidth + Math.max(0, count - 1) * tabGap;
  const addAfterLastLeft = tabsSpan + (count > 0 ? ADD_BUTTON_GAP : 0);

  const slotLefts = useMemo(
    () => order.map((_, index) => index * (tabWidth + tabGap)),
    [order, tabGap, tabWidth],
  );

  const dragStartIndex = draggingId ? order.indexOf(draggingId) : -1;

  const visualIndexFor = useCallback(
    (index: number) => {
      if (dragStartIndex < 0 || dragTargetIndex < 0) return index;
      if (index === dragStartIndex) return dragTargetIndex;

      if (
        dragTargetIndex > dragStartIndex &&
        index > dragStartIndex &&
        index <= dragTargetIndex
      ) {
        return index - 1;
      }
      if (
        dragTargetIndex < dragStartIndex &&
        index >= dragTargetIndex &&
        index < dragStartIndex
      ) {
        return index + 1;
      }
      return index;
    },
    [dragStartIndex, dragTargetIndex],
  );

  /**
   * Width policy:
   * 1. Prefer preferred tab width; grow to the right.
   * 2. If needed, compress every tab equally down to TAB_MIN_WIDTH.
   * 3. Once all tabs are at min and still overflow → enable horizontal scroll
   *    and pin the + button outside the scrollport (before trailing chrome).
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroll = scrollRef.current;
    if (!root || !scroll) return;

    const measure = () => {
      const trailingWidth = trailingRef.current?.offsetWidth ?? 0;
      const railInner = root.clientWidth - railInsetLeft;
      // Scrollport shares the rail with optional pinned + and fixed trailing chrome.
      // First assume + is inline; if we must pin, remeasure-equivalent by reserving it.
      const reservePinnedAdd = ADD_BUTTON_SIZE + ADD_BUTTON_GAP;
      const availableForScrollAndAdd = Math.max(
        0,
        railInner - trailingWidth - TRAILING_GAP,
      );

      const n = Math.max(1, orderRef.current.length);
      const gaps = (n - 1) * tabGap;

      // Try fitting tabs + inline + inside available width at preferred size.
      const preferredTabs = n * TAB_WIDTH + gaps;
      const preferredWithAdd = preferredTabs + ADD_BUTTON_GAP + ADD_BUTTON_SIZE;

      let nextWidth = TAB_WIDTH;
      let nextPinAdd = false;

      if (preferredWithAdd <= availableForScrollAndAdd) {
        nextWidth = TAB_WIDTH;
        nextPinAdd = false;
      } else {
        // Compress tabs so tabs + inline + fit.
        const usableForTabs =
          availableForScrollAndAdd - ADD_BUTTON_GAP - ADD_BUTTON_SIZE;
        const fitted = Math.floor((usableForTabs - gaps) / n);
        if (fitted >= TAB_MIN_WIDTH) {
          nextWidth = Math.min(TAB_WIDTH, Math.max(TAB_MIN_WIDTH, fitted));
          nextPinAdd = false;
        } else {
          // Min width — scroll; pin + outside scrollport.
          nextWidth = TAB_MIN_WIDTH;
          nextPinAdd = true;
        }
      }

      // When pinned, scrollport is narrower by the pinned + slot.
      const scrollPort = nextPinAdd
        ? Math.max(0, availableForScrollAndAdd - reservePinnedAdd)
        : availableForScrollAndAdd;

      const nextTabsSpan = n * nextWidth + gaps;
      const track =
        nextTabsSpan +
        (nextPinAdd || !onAdd ? 0 : ADD_BUTTON_GAP + ADD_BUTTON_SIZE);

      setTabWidth(nextWidth);
      setPinAdd(nextPinAdd);
      setScrollPortWidth(scrollPort);
      setTrackWidth(Math.max(scrollPort, track));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(scroll);
    if (trailingRef.current) observer.observe(trailingRef.current);
    return () => observer.disconnect();
  }, [items.length, onAdd, railInsetLeft, tabGap]);

  // Keep the active tab (and trailing inline +) in view after layout / selection.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !activeId) return;

    const index = orderRef.current.indexOf(activeId);
    if (index < 0) return;

    const tabLeft = index * (tabWidth + tabGap);
    const tabRight = tabLeft + tabWidth;
    const viewLeft = scroll.scrollLeft;
    const viewRight = viewLeft + scroll.clientWidth;
    const padding = 8;

    if (tabLeft < viewLeft + padding) {
      scroll.scrollTo({ left: Math.max(0, tabLeft - padding), behavior: "smooth" });
    } else if (tabRight > viewRight - padding) {
      scroll.scrollTo({
        left: tabRight - scroll.clientWidth + padding,
        behavior: "smooth",
      });
    }
  }, [activeId, items.length, tabGap, tabWidth, trackWidth]);

  const setActive = useCallback(
    (id: string | null) => {
      if (id && itemMap.get(id)?.disabled) return;
      if (!controlled) setInternalValue(id);
      onValueChange?.(id);
    },
    [controlled, itemMap, onValueChange],
  );

  useEffect(() => {
    if (currentValue && itemMap.has(currentValue)) return;
    if (firstEnabledItem && firstEnabledItem.id !== currentValue) {
      setActive(firstEnabledItem.id);
    }
  }, [currentValue, firstEnabledItem, itemMap, setActive]);

  const activeOrderIndex = activeId ? order.indexOf(activeId) : -1;
  const activeVisualIndex =
    activeOrderIndex < 0 ? -1 : visualIndexFor(activeOrderIndex);

  useLayoutEffect(() => {
    if (
      !activeId ||
      activeVisualIndex < 0 ||
      activeId === draggingId ||
      slotLefts[activeVisualIndex] === undefined
    ) {
      return;
    }

    surfaceAnimationRef.current?.stop();

    if (draggingId) return;

    surfaceAnimationRef.current = animateValue(
      surfaceLeft,
      slotLefts[activeVisualIndex],
      reduce ? { duration: 0 } : SPRING_GLIDE,
    );
  }, [
    activeId,
    activeVisualIndex,
    draggingId,
    reduce,
    slotLefts,
    surfaceLeft,
  ]);

  const commitOrder = useCallback(
    (next: string[], notify: boolean) => {
      orderRef.current = next;
      setOrder((current) => (sameOrder(current, next) ? current : next));
      if (notify) onOrderChange?.(next);
    },
    [onOrderChange],
  );

  const registerPosition = useCallback(
    (id: string, position: MotionValue<number> | null) => {
      tabPositionRefs.current[id] = position;
    },
    [],
  );

  const startDrag = useCallback(
    (id: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.button !== 0 ||
        itemMap.get(id)?.disabled ||
        dragRef.current
      ) {
        return;
      }

      const startIndex = orderRef.current.indexOf(id);
      if (startIndex < 0) return;
      const capturedSlots = orderRef.current.map(
        (_, index) => index * (tabWidth + tabGap),
      );
      const startLeft = capturedSlots[startIndex];

      dragAnimationRef.current?.stop();
      dragAnimationRef.current = null;
      dragLeft.set(startLeft);
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        originX: event.clientX,
        startLeft,
        startIndex,
        targetIndex: startIndex,
        moved: false,
        finishing: false,
        startOrder: orderRef.current.slice(),
        slotLefts: capturedSlots,
      };
    },
    [dragLeft, itemMap, tabGap, tabWidth],
  );

  const moveDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.finishing || drag.pointerId !== event.pointerId) return;

      const delta = event.clientX - drag.originX;
      if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD) return;
      event.preventDefault();

      if (!drag.moved) {
        drag.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (drag.id === activeId) {
          surfaceAnimationRef.current?.stop();
          surfaceLeft.set(drag.startLeft);
        }
        setDraggingId(drag.id);
        setDragTargetIndex(drag.startIndex);
      }

      // Allow drag within the track (including overflow scroll content).
      const minLeft = drag.slotLefts[0] ?? 0;
      const maxLeft =
        drag.slotLefts[drag.slotLefts.length - 1] ?? minLeft;
      const visualLeft = Math.max(
        minLeft,
        Math.min(maxLeft, drag.startLeft + delta),
      );
      let targetIndex = drag.startIndex;
      const width = tabWidth;

      if (visualLeft >= drag.startLeft) {
        for (
          let index = drag.startIndex + 1;
          index < drag.slotLefts.length;
          index += 1
        ) {
          if (visualLeft + width / 2 >= drag.slotLefts[index]) {
            targetIndex = index;
          }
        }
      } else {
        for (let index = drag.startIndex - 1; index >= 0; index -= 1) {
          if (visualLeft <= drag.slotLefts[index] + width / 2) {
            targetIndex = index;
          }
        }
      }

      // Edge auto-scroll while dragging.
      const scroll = scrollRef.current;
      if (scroll && scroll.scrollWidth > scroll.clientWidth) {
        const edge = 28;
        const rect = scroll.getBoundingClientRect();
        if (event.clientX > rect.right - edge) {
          scroll.scrollLeft += 10;
        } else if (event.clientX < rect.left + edge) {
          scroll.scrollLeft -= 10;
        }
      }

      dragLeft.set(visualLeft);
      if (targetIndex !== drag.targetIndex) {
        drag.targetIndex = targetIndex;
        setDragTargetIndex(targetIndex);
      }
    },
    [activeId, dragLeft, surfaceLeft, tabWidth],
  );

  const finishDrag = useCallback(
    (pointerId: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId || drag.finishing) return;

      if (!drag.moved) {
        dragRef.current = null;
        return;
      }

      drag.finishing = true;
      const targetLeft = drag.slotLefts[drag.targetIndex];
      const controls = animateValue(
        dragLeft,
        targetLeft,
        reduce ? { duration: 0 } : SPRING_GLIDE,
      );
      dragAnimationRef.current = controls;

      void controls.then(async () => {
        if (dragAnimationRef.current !== controls) return;
        const next = moveItem(
          drag.startOrder,
          drag.startIndex,
          drag.targetIndex,
        );

        if (!reduce) {
          await new Promise<void>((resolve) => {
            const startedAt = performance.now();
            const check = () => {
              const settled = next.every((id, index) => {
                if (id === drag.id) return true;
                const position = tabPositionRefs.current[id];
                if (!position) return true;
                return (
                  Math.abs(position.get() - drag.slotLefts[index]) < 0.5 &&
                  Math.abs(position.getVelocity()) < 10
                );
              });

              if (settled || performance.now() - startedAt > 500) {
                resolve();
                return;
              }
              requestAnimationFrame(check);
            };
            check();
          });
        }

        if (dragAnimationRef.current !== controls) return;
        if (drag.id === activeId) {
          surfaceLeft.set(targetLeft);
        } else if (activeId) {
          const activePosition = tabPositionRefs.current[activeId];
          if (activePosition) surfaceLeft.set(activePosition.get());
        }
        tabPositionRefs.current[drag.id]?.jump(targetLeft);
        dragAnimationRef.current = null;
        dragRef.current = null;
        commitOrder(next, !sameOrder(drag.startOrder, next));
        setDraggingId(null);
        setDragTargetIndex(-1);
      });
    },
    [activeId, commitOrder, dragLeft, reduce, surfaceLeft],
  );

  useEffect(() => {
    const finishFromWindow = (event: PointerEvent) => {
      finishDrag(event.pointerId);
    };
    window.addEventListener("pointerup", finishFromWindow, true);
    window.addEventListener("pointercancel", finishFromWindow, true);
    return () => {
      window.removeEventListener("pointerup", finishFromWindow, true);
      window.removeEventListener("pointercancel", finishFromWindow, true);
    };
  }, [finishDrag]);

  const moveBy = useCallback(
    (id: string, direction: -1 | 1) => {
      const current = orderRef.current;
      const index = current.indexOf(id);
      const nextIndex = index + direction;
      if (
        index < 0 ||
        nextIndex < 0 ||
        nextIndex >= current.length ||
        itemMap.get(id)?.disabled
      ) {
        return;
      }
      commitOrder(moveItem(current, index, nextIndex), true);
    },
    [commitOrder, itemMap],
  );

  const handleTabKeyDown = useCallback(
    (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = orderRef.current.indexOf(id);
      if (index < 0) return;

      if (
        event.altKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        moveBy(id, event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex =
        (index + direction + orderRef.current.length) % orderRef.current.length;
      const nextId = orderRef.current[nextIndex];
      setActive(nextId);
      requestAnimationFrame(() => tabButtonRefs.current[nextId]?.focus());
    },
    [moveBy, setActive],
  );

  const shouldShowClose = useCallback(
    (id: string) => {
      if (!onClose) return false;
      if (typeof canClose === "function") return canClose(id);
      return canClose;
    },
    [canClose, onClose],
  );

  if (!orderedItems.length) return null;

  const { className: railClassName, ...restRailProps } = railProps ?? {};
  // Liquid SVG lives on the track so it scrolls with tabs.
  const surfaceWidth = Math.max(trackWidth, scrollPortWidth, 1);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate flex min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-300/80 text-foreground dark:bg-zinc-900",
        classNames?.root,
        className,
      )}
    >
      <div
        style={{ height: RAIL_HEIGHT, paddingLeft: railInsetLeft }}
        className={cn(
          "relative z-30 flex min-w-0 shrink-0 items-stretch",
          railClassName,
        )}
        {...restRailProps}
      >
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden no-scrollbar"
          style={{ height: RAIL_HEIGHT }}
        >
          <div
            ref={(node) => {
              trackRef.current = node;
              setTrackEl((prev) => (prev === node ? prev : node));
            }}
            role="tablist"
            aria-label={ariaLabel}
            aria-orientation="horizontal"
            className={cn("relative h-full", classNames?.rail)}
            style={{
              width: trackWidth || undefined,
              minWidth: "100%",
              height: RAIL_HEIGHT,
            }}
          >
            {orderedItems.map((item, index) => {
              const isActive = item.id === activeId;
              const isDragging = item.id === draggingId;
              const visualIndex = visualIndexFor(index);
              const targetLeft = slotLefts[visualIndex] ?? 0;
              const tabId = `${uid}-tab-${safeId(item.id)}`;
              const showClose = shouldShowClose(item.id);

              return (
                <SpringTab
                  key={item.id}
                  id={item.id}
                  targetLeft={targetLeft}
                  dragging={isDragging}
                  dragLeft={dragLeft}
                  surfaceLeft={surfaceLeft}
                  reduce={reduce}
                  active={isActive}
                  anyDragging={Boolean(draggingId)}
                  surfaceHost={trackEl}
                  surfaceWidth={surfaceWidth}
                  contentInset={contentInset}
                  tabWidth={tabWidth}
                  surfaceClassName={classNames?.activeTab}
                  zIndex={isDragging ? 30 : isActive ? 20 : 1}
                  className={cn(
                    "group absolute left-0 top-0 flex select-none touch-pan-y items-stretch desktop-no-drag",
                    item.disabled && "cursor-not-allowed",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                  )}
                  registerPosition={registerPosition}
                  onPointerDown={(event) => startDrag(item.id, event)}
                  onPointerMove={moveDrag}
                  onPointerUp={(event) => finishDrag(event.pointerId)}
                  onPointerCancel={(event) => finishDrag(event.pointerId)}
                  onLostPointerCapture={(event) => finishDrag(event.pointerId)}
                >
                  <div
                    style={{
                      width: tabWidth,
                      height: TAB_HEIGHT,
                      marginTop: TAB_TOP,
                    }}
                    className="relative flex items-stretch"
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 bottom-0 rounded-t-[10px] bg-background"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-x-0.5 bottom-0.5 top-0.5 rounded-lg transition-colors duration-200",
                          isDragging
                            ? "bg-background/60"
                            : "bg-transparent group-hover:bg-background/45",
                        )}
                      />
                    )}

                    <button
                      ref={(node) => {
                        tabButtonRefs.current[item.id] = node;
                      }}
                      id={tabId}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`${uid}-panel`}
                      aria-disabled={item.disabled || undefined}
                      tabIndex={isActive ? 0 : -1}
                      disabled={item.disabled}
                      title={item.label}
                      onClick={() => {
                        const drag = dragRef.current;
                        if (drag?.id === item.id && drag.moved) return;
                        setActive(item.id);
                      }}
                      onKeyDown={(event) => handleTabKeyDown(item.id, event)}
                      className={cn(
                        "group relative z-10 flex h-full w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-t-[10px] px-2.5 text-left text-xs outline-none transition-colors",
                        isActive
                          ? "text-foreground"
                          : "pb-0.5 text-muted-foreground hover:text-foreground",
                        showClose && "pr-7",
                        classNames?.tab,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-x-0.5 top-0.5 opacity-0 transition-opacity group-focus-visible:opacity-100",
                          isActive
                            ? "bottom-0 rounded-t-lg border-x border-t border-foreground/20"
                            : "bottom-0.5 rounded-md border border-foreground/40",
                        )}
                      />
                      {item.icon ? (
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-3.5 shrink-0 place-items-center",
                            classNames?.icon,
                          )}
                        >
                          {item.icon}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "min-w-0 truncate whitespace-nowrap text-[11px] font-medium leading-none",
                          classNames?.label,
                        )}
                      >
                        {item.label}
                      </span>
                    </button>

                    {showClose && onClose ? (
                      <button
                        type="button"
                        aria-label={
                          closeAriaLabel
                            ? closeAriaLabel(item.label)
                            : `Close ${item.label}`
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onClose(item.id);
                        }}
                        className={cn(
                          "absolute right-1 top-1/2 z-20 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          !isActive &&
                            "top-[calc(50%-1px)] opacity-0 group-hover:opacity-100 hover:bg-background/60",
                          isActive && "opacity-100",
                          classNames?.close,
                        )}
                      >
                        <X aria-hidden className="size-3 stroke-[1.5]" />
                      </button>
                    ) : null}
                  </div>
                </SpringTab>
              );
            })}

            {onAdd && !pinAdd ? (
              <div
                className="absolute top-0 flex h-full items-end pb-0.5"
                style={{ left: addAfterLastLeft }}
              >
                <AddTabButton ariaLabel={addAriaLabel} onClick={onAdd} />
              </div>
            ) : null}
          </div>
        </div>

        {onAdd && pinAdd ? (
          <div className="desktop-no-drag flex h-full shrink-0 items-end pb-0.5 pl-1">
            <AddTabButton ariaLabel={addAriaLabel} onClick={onAdd} />
          </div>
        ) : null}

        {trailing ? (
          <div
            ref={trailingRef}
            className="desktop-no-drag flex h-full shrink-0 items-end pb-0.5 pr-1.5 pl-1"
          >
            {trailing}
          </div>
        ) : (
          <div ref={trailingRef} className="hidden" />
        )}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${safeId(activeId ?? "empty")}`}
        className={cn(
          "relative z-20 flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground",
          "rounded-tr-[12px]",
          classNames?.content,
        )}
      >
        {children}
      </div>
    </div>
  );
}
