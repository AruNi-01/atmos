"use client";
// Adapted from beui.dev Morphing Tabs (MIT) — density + Atmos tokens only.
// https://beui.dev/components/blocks/morphing-tabs
// Drag / reorder / liquid path logic is intentionally unchanged from upstream.

import { Plus, X } from "lucide-react";
import {
  AnimatePresence,
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

import { EASE_OUT, SPRING_GLIDE, SPRING_PRESS } from "../lib/morphing-ease";

export type MorphingTabsItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Per-tab panel body (beui). Prefer shared `children` for Atmos browser chrome. */
  content?: ReactNode;
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
  closeAriaLabel?: (label: string) => string;
  ariaLabel?: string;
  className?: string;
  classNames?: MorphingTabsClassNames;
  /**
   * Shared panel body (Atmos browser toolbar). When set, replaces per-item
   * `content` + AnimatePresence — panel stays mounted across tab switches.
   */
  children?: ReactNode;
  /** Fixed rail chrome after tabs (favorites / overflow / +). */
  trailing?: ReactNode;
  /** New-tab control after the last tab. */
  onAdd?: () => void;
  addAriaLabel?: string;
  /** Extra left inset for macOS traffic lights (added to SURFACE_INSET for slots). */
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
  /** Horizontal scroll of the tab strip — liquid is root-fixed so subtract this. */
  scrollLeft: MotionValue<number>;
  reduce: boolean;
  active: boolean;
  anyDragging: boolean;
  surfaceHost: HTMLDivElement | null;
  surfaceWidth: number;
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

const DRAG_THRESHOLD = 5;
/** Dense browser chrome scale of beui defaults (logic unchanged). */
const TAB_WIDTH = 156;
const TAB_HEIGHT = 28;
const TAB_TOP = 2;
const TAB_RADIUS = 10;
const RAIL_HEIGHT = 30;
/** 0 = flush with panel edge so first active tab joins square TL (beui inset was 16). */
const SURFACE_INSET = 0;
const LIQUID_JOIN = 12;
/** How far the liquid fill dips into the content panel for corner morphs.
 *  Keep small — dense chrome toolbar sits right under the rail. */
const PANEL_RADIUS = 8;
const ADD_BUTTON_SIZE = 24;
const ADD_BUTTON_GAP = 4;
/** Extra scroll room so active-tab liquid ears (bottom L/R) are not clipped by
 *  the scrollport edge — symmetric when the tab is not flush with the strip end. */
const SCROLL_EDGE_PAD = LIQUID_JOIN + 4;

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

/** Panel top edge only (full corner radii) — used when the active tab has
 *  scrolled fully out of the visible strip so the fill is not pinned at an edge. */
function liquidPanelOnlyPath(surfaceWidth: number) {
  const panelLeft = SURFACE_INSET;
  const panelRight = Math.max(panelLeft + TAB_WIDTH, surfaceWidth - SURFACE_INSET);
  const bottom = RAIL_HEIGHT;
  const r = PANEL_RADIUS;
  return [
    `M${panelLeft} ${bottom + r}`,
    `V${bottom + r}`,
    `Q${panelLeft} ${bottom} ${panelLeft + r} ${bottom}`,
    `H${panelRight - r}`,
    `Q${panelRight} ${bottom} ${panelRight} ${bottom + r}`,
    `V${bottom + r}`,
    "Z",
  ].join(" ");
}

function liquidTabPath(tabLeft: number, surfaceWidth: number) {
  const panelLeft = SURFACE_INSET;
  const panelRight = Math.max(panelLeft + TAB_WIDTH, surfaceWidth - SURFACE_INSET);
  // Viewport x of the active tab (track left − scroll). Do NOT clamp into the
  // panel — clamping pinned the silhouette at the left/right when scrolling.
  const left = tabLeft;
  const right = left + TAB_WIDTH;
  const top = RAIL_HEIGHT - TAB_HEIGHT;
  const bottom = RAIL_HEIGHT;

  // Fully off-screen → only the content top strip (no stuck edge tab fill).
  if (right < panelLeft || left > panelRight) {
    return liquidPanelOnlyPath(surfaceWidth);
  }

  const leftJoin = Math.max(panelLeft, left - LIQUID_JOIN);
  const rightJoin = Math.min(panelRight, right + LIQUID_JOIN);
  const leftDepth = Math.max(0, Math.min(LIQUID_JOIN, left - leftJoin));
  const rightDepth = Math.max(0, Math.min(LIQUID_JOIN, rightJoin - right));
  const leftControl = leftDepth * 0.55;
  const rightControl = rightDepth * 0.55;
  // Flush with content left only when the tab edge is at/near panelLeft.
  // Scrolled past the left edge → full radius (not square residual).
  const leftPanelRadius =
    left <= panelLeft
      ? Math.min(PANEL_RADIUS, Math.max(0, panelLeft - left))
      : Math.min(PANEL_RADIUS, Math.max(0, leftJoin - panelLeft));
  const rightPanelRadius =
    right >= panelRight
      ? Math.min(PANEL_RADIUS, Math.max(0, right - panelRight))
      : Math.min(PANEL_RADIUS, Math.max(0, panelRight - rightJoin));

  return [
    `M${panelLeft} ${bottom + PANEL_RADIUS}`,
    `V${bottom + leftPanelRadius}`,
    `Q${panelLeft} ${bottom} ${panelLeft + leftPanelRadius} ${bottom}`,
    `H${leftJoin}`,
    `C${leftJoin + leftControl} ${bottom} ${left} ${bottom - leftDepth + leftControl} ${left} ${bottom - leftDepth}`,
    `V${top + TAB_RADIUS}`,
    `Q${left} ${top} ${left + TAB_RADIUS} ${top}`,
    `H${right - TAB_RADIUS}`,
    `Q${right} ${top} ${right} ${top + TAB_RADIUS}`,
    `V${bottom - rightDepth}`,
    `C${right} ${bottom - rightDepth + rightControl} ${rightJoin - rightControl} ${bottom} ${rightJoin} ${bottom}`,
    `H${panelRight - rightPanelRadius}`,
    `Q${panelRight} ${bottom} ${panelRight} ${bottom + rightPanelRadius}`,
    `V${bottom + PANEL_RADIUS}`,
    "Z",
  ].join(" ");
}

function SpringTab({
  id,
  targetLeft,
  dragging,
  dragLeft,
  surfaceLeft,
  scrollLeft,
  reduce,
  active,
  anyDragging,
  surfaceHost,
  surfaceWidth,
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
    target.set(targetLeft);
    if (reduce) position.jump(targetLeft);
  }, [position, reduce, target, targetLeft]);

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
      {active && surfaceHost && surfaceWidth > SURFACE_INSET * 2
        ? createPortal(
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox={`0 0 ${surfaceWidth} ${RAIL_HEIGHT + PANEL_RADIUS}`}
              preserveAspectRatio="none"
              className={cn(
                // Always below the content panel (z-20). Raising to z-20 on drag
                // (beui default) paints the full-width panel strip over the toolbar.
                "pointer-events-none absolute inset-x-0 top-0 z-[15] w-full text-background",
                surfaceClassName,
              )}
              style={{ height: RAIL_HEIGHT + PANEL_RADIUS }}
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
                scrollLeft={scrollLeft}
                surfaceWidth={surfaceWidth}
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
  scrollLeft,
  surfaceWidth,
}: {
  /** Active tab left in track coordinates. */
  left: MotionValue<number>;
  /** Tab strip scroll — liquid SVG is root-fixed, so tab x = left − scroll. */
  scrollLeft: MotionValue<number>;
  surfaceWidth: number;
}) {
  const path = useTransform([left, scrollLeft], ([tabLeft, scroll]: number[]) =>
    liquidTabPath(tabLeft - scroll, surfaceWidth),
  );
  return <motion.path d={path} fill="currentColor" />;
}

function AddTabButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(event) => {
        onClick();
        event.currentTarget.blur();
      }}
      className="desktop-no-drag flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/50 hover:text-foreground"
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
  closeAriaLabel,
  ariaLabel = "Tabs",
  className,
  classNames,
  children,
  trailing,
  onAdd,
  addAriaLabel = "New tab",
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
  const railRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
  /** Shared with surfaceLeft when selection needs strip scroll (coordinated). */
  const scrollAnimationRef = useRef<ReturnType<typeof animateValue> | null>(
    null,
  );
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [tabGap, setTabGap] = useState(4);
  const [pinAdd, setPinAdd] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState(-1);
  // Tab strip origin (beui SURFACE_INSET + optional traffic-light pad).
  const tabOrigin = SURFACE_INSET + railInsetLeft;
  const dragLeft = useMotionValue(tabOrigin);
  const surfaceLeft = useMotionValue(tabOrigin);
  const scrollLeftMv = useMotionValue(0);

  useEffect(() => {
    setOrder((current) => {
      const available = new Set(itemIds);
      // Same tab set, possibly different order: parent/persisted order wins
      // (reload, external prefs). Local drag updates parent in the same tick
      // via onOrderChange, so this stays aligned after reorder.
      if (
        current.length === itemIds.length &&
        current.length > 0 &&
        current.every((id) => available.has(id))
      ) {
        return sameOrder(current, itemIds) ? current : itemIds.slice();
      }
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

  const slotLefts = useMemo(
    () =>
      order.map(
        (_, index) => tabOrigin + index * (TAB_WIDTH + tabGap),
      ),
    [order, tabGap, tabOrigin],
  );

  const count = orderedItems.length;
  const tabsSpan =
    count <= 0 ? 0 : count * TAB_WIDTH + Math.max(0, count - 1) * tabGap;
  // Inline + sits just after the last tab until the strip overflows.
  const addAfterLastLeft =
    tabOrigin + tabsSpan + (count > 0 ? ADD_BUTTON_GAP : 0);

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

  useLayoutEffect(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    const scroll = scrollRef.current;
    if (!root || !rail) return;

    const measure = () => {
      const nextGap = Number.parseFloat(getComputedStyle(rail).columnGap);
      const gap = Number.isFinite(nextGap) && nextGap > 0 ? nextGap : tabGap;
      if (Number.isFinite(nextGap) && nextGap > 0 && nextGap !== tabGap) {
        setTabGap(nextGap);
      }

      const n = Math.max(1, orderRef.current.length);
      const gaps = Math.max(0, n - 1) * gap;
      const tabsContent =
        tabOrigin + n * TAB_WIDTH + gaps;
      const withInlineAdd = onAdd
        ? tabsContent + ADD_BUTTON_GAP + ADD_BUTTON_SIZE
        : tabsContent;

      const trailingWidth = trailingRef.current?.offsetWidth ?? 0;
      // Scroll strip = root − trailing (− pinned + when overflowing).
      const availableForStrip = Math.max(0, root.clientWidth - trailingWidth);
      // Overflow → pin + outside the scrollport so it never scrolls away.
      const nextPinAdd = Boolean(onAdd && withInlineAdd > availableForStrip);
      const addReserve = nextPinAdd ? ADD_BUTTON_GAP + ADD_BUTTON_SIZE : 0;
      const scrollPort = Math.max(0, availableForStrip - addReserve);
      // End pad lets the last tab's right liquid ear sit clear of the scroll edge.
      const trackBody = nextPinAdd
        ? tabsContent + SCROLL_EDGE_PAD
        : withInlineAdd + SCROLL_EDGE_PAD;
      const track = Math.max(scrollPort, trackBody);

      setPinAdd(nextPinAdd);
      setTrackWidth(track);
      setSurfaceWidth(root.clientWidth);
    };

    measure();
    const onScroll = () => {
      if (scroll) scrollLeftMv.set(scroll.scrollLeft);
    };
    onScroll();
    scroll?.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (scroll) observer.observe(scroll);
    if (trailingRef.current) observer.observe(trailingRef.current);
    return () => {
      scroll?.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [items.length, onAdd, scrollLeftMv, tabGap, tabOrigin]);

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

  // Active fill is trackX − scrollLeft. Drive surface + scroll with the same
  // progress so far tabs / new tabs glide together (never reverse-slide).
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
    scrollAnimationRef.current?.stop();
    if (draggingId) return;

    const toSurface = slotLefts[activeVisualIndex];
    const fromSurface = surfaceLeft.get();
    const scroll = scrollRef.current;
    const fromScroll = scroll?.scrollLeft ?? 0;

    let toScroll = fromScroll;
    if (scroll && scroll.scrollWidth > scroll.clientWidth) {
      const tabLeft = toSurface;
      const tabRight = toSurface + TAB_WIDTH;
      const padding = SCROLL_EDGE_PAD;
      const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      if (tabLeft < fromScroll + padding) {
        toScroll = Math.max(0, Math.min(maxScroll, tabLeft - padding));
      } else if (tabRight > fromScroll + scroll.clientWidth - padding) {
        toScroll = Math.max(
          0,
          Math.min(maxScroll, tabRight - scroll.clientWidth + padding),
        );
      }
    }

    const surfaceDelta = Math.abs(toSurface - fromSurface);
    const scrollDelta = Math.abs(toScroll - fromScroll);

    if (reduce || (surfaceDelta < 0.5 && scrollDelta < 0.5)) {
      surfaceLeft.set(toSurface);
      if (scroll) {
        scroll.scrollLeft = toScroll;
        scrollLeftMv.set(toScroll);
      }
      return;
    }

    // In-view only: classic beui liquid glide (no strip scroll).
    if (scrollDelta < 0.5) {
      surfaceAnimationRef.current = animateValue(
        surfaceLeft,
        toSurface,
        SPRING_GLIDE,
      );
      return;
    }

    // Shared progress: visual = surface − scroll stays a clean lerp of old→new.
    const controls = animateValue(0, 1, {
      ...SPRING_GLIDE,
      onUpdate: (p: number) => {
        surfaceLeft.set(fromSurface + (toSurface - fromSurface) * p);
        if (scroll) {
          const s = fromScroll + (toScroll - fromScroll) * p;
          scroll.scrollLeft = s;
          scrollLeftMv.set(s);
        }
      },
    });
    surfaceAnimationRef.current = controls;
    scrollAnimationRef.current = controls;
    void controls.then(() => {
      if (surfaceAnimationRef.current !== controls) return;
      surfaceLeft.set(toSurface);
      if (scroll) {
        scroll.scrollLeft = toScroll;
        scrollLeftMv.set(toScroll);
      }
    });
  }, [
    activeId,
    activeVisualIndex,
    draggingId,
    reduce,
    slotLefts,
    surfaceLeft,
    scrollLeftMv,
    trackWidth,
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
        (_, index) => tabOrigin + index * (TAB_WIDTH + tabGap),
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
    [dragLeft, itemMap, tabGap, tabOrigin],
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

      const minLeft = drag.slotLefts[0];
      const maxLeft = drag.slotLefts[drag.slotLefts.length - 1];
      const visualLeft = Math.max(
        minLeft,
        Math.min(maxLeft, drag.startLeft + delta),
      );
      let targetIndex = drag.startIndex;

      if (visualLeft >= drag.startLeft) {
        for (
          let index = drag.startIndex + 1;
          index < drag.slotLefts.length;
          index += 1
        ) {
          if (visualLeft + TAB_WIDTH / 2 >= drag.slotLefts[index]) {
            targetIndex = index;
          }
        }
      } else {
        for (let index = drag.startIndex - 1; index >= 0; index -= 1) {
          if (visualLeft <= drag.slotLefts[index] + TAB_WIDTH / 2) {
            targetIndex = index;
          }
        }
      }

      // Edge auto-scroll while the strip overflows.
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
    [activeId, dragLeft, surfaceLeft],
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

      controls.then(async () => {
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

  if (!orderedItems.length) return null;

  const { className: railClassName, ...restRailProps } = railProps ?? {};
  // Always-round content corners (beui). Liquid sits under the panel (z-15)
  // and fills the TL cutout to square when the active tab is flush left.
  const panelRadiusStyle = {
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
  } as const;

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
        className="relative z-30 flex min-w-0 shrink-0 items-stretch overflow-hidden"
        style={{ height: RAIL_HEIGHT }}
        {...restRailProps}
      >
        {/*
          isolate + overflow clip the tab strip so absolute tabs (z-20/30) cannot
          paint over the trailing chrome. Without a stacking context, positioned
          tab z-index participates in the parent and covers favorites / ⋯.
        */}
        <div
          ref={scrollRef}
          className="relative z-0 min-w-0 flex-1 isolate overflow-x-auto overflow-y-hidden no-scrollbar"
          style={{ height: RAIL_HEIGHT }}
        >
          <div
            ref={railRef}
            role="tablist"
            aria-label={ariaLabel}
            aria-orientation="horizontal"
            className={cn(
              // gap is read via getComputedStyle for tabGap (beui); tabs are absolute.
              "relative gap-1",
              classNames?.rail,
              railClassName,
            )}
            style={{
              height: RAIL_HEIGHT,
              width: trackWidth || undefined,
              minWidth: "100%",
            }}
          >
            {/* Dividers between tabs that are not next to the active slot. */}
            {Array.from({ length: Math.max(0, count - 1) }, (_, gapIndex) => {
              // Gap sits between visual slots gapIndex and gapIndex + 1.
              if (
                activeVisualIndex === gapIndex ||
                activeVisualIndex === gapIndex + 1
              ) {
                return null;
              }
              const left =
                tabOrigin +
                (gapIndex + 1) * (TAB_WIDTH + tabGap) -
                tabGap / 2;
              // Align with tab mid-line (tabs sit at TAB_TOP, not rail center).
              const top = TAB_TOP + TAB_HEIGHT / 2;
              return (
                <div
                  key={`tab-divider-${gapIndex}`}
                  aria-hidden
                  className="pointer-events-none absolute z-[2] h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-border/60"
                  style={{ left, top }}
                />
              );
            })}

            {orderedItems.map((item, index) => {
              const isActive = item.id === activeId;
              const isDragging = item.id === draggingId;
              const visualIndex = visualIndexFor(index);
              const targetLeft = slotLefts[visualIndex] ?? tabOrigin;
              const tabId = `${uid}-tab-${safeId(item.id)}`;

              return (
                <SpringTab
                  key={item.id}
                  id={item.id}
                  targetLeft={targetLeft}
                  dragging={isDragging}
                  dragLeft={dragLeft}
                  surfaceLeft={surfaceLeft}
                  scrollLeft={scrollLeftMv}
                  reduce={reduce}
                  active={isActive}
                  anyDragging={Boolean(draggingId)}
                  surfaceHost={rootRef.current}
                  surfaceWidth={surfaceWidth}
                  surfaceClassName={classNames?.activeTab}
                  zIndex={isDragging ? 30 : isActive ? 20 : 1}
                  className={cn(
                    "group absolute left-0 top-0 flex select-none touch-pan-y items-stretch desktop-no-drag",
                    item.disabled && "cursor-not-allowed",
                    // Grabbing only while actually dragging — not on idle hover.
                    isDragging && "cursor-grabbing",
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
                      width: TAB_WIDTH,
                      height: TAB_HEIGHT,
                      marginTop: TAB_TOP,
                    }}
                    className="relative flex items-stretch"
                  >
                    {!isActive ? (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-x-0.5 bottom-0.5 top-0.5 rounded-lg",
                          isDragging
                            ? "bg-background/60"
                            : "bg-transparent group-hover:bg-background/45",
                        )}
                      />
                    ) : null}

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
                        "group relative z-10 flex h-full w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-t-[10px] px-2.5 text-left text-xs outline-none",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                        onClose && "pr-7",
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

                    {onClose ? (
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
                          "absolute right-1 top-1/2 z-20 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          !isActive &&
                            "opacity-0 group-hover:opacity-100 hover:bg-background/60",
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
          <div className="desktop-no-drag relative z-10 flex h-full shrink-0 items-end bg-zinc-300/80 pb-0.5 pl-1 dark:bg-zinc-900">
            <AddTabButton ariaLabel={addAriaLabel} onClick={onAdd} />
          </div>
        ) : null}

        {trailing ? (
          <div
            ref={trailingRef}
            className="desktop-no-drag relative z-10 flex h-full shrink-0 items-end bg-zinc-300/80 pb-0.5 pr-1.5 pl-1 dark:bg-zinc-900"
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
          classNames?.content,
        )}
        style={panelRadiusStyle}
      >
        {children != null ? (
          children
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {activeItem ? (
              <motion.div
                key={activeItem.id}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: 8, filter: "blur(6px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={
                  reduce
                    ? {
                        opacity: 0,
                        transition: { duration: 0.08, ease: EASE_OUT },
                      }
                    : {
                        opacity: 0,
                        y: -5,
                        filter: "blur(5px)",
                        transition: { duration: 0.12, ease: EASE_OUT },
                      }
                }
                transition={
                  reduce
                    ? { duration: 0.12, ease: EASE_OUT }
                    : SPRING_PRESS
                }
                className="min-h-0 flex-1"
              >
                {activeItem.content}
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
