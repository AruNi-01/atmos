"use client";
// beui.dev/components/motion/tabs
//
// The sliding indicator is a single list-level layer animated with CSS
// transform. Shared-element projection remeasures on sibling layout
// (center pane mounts) and hitches the pill; compositor CSS does not.

import { motion, useReducedMotion } from "motion/react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { EASE_OUT, EASE_OUT_CSS } from "../../lib/ease";
import { cn } from "../../lib/utils";

type Variant = "pill" | "underline" | "segment";

type Ctx = {
  value: string;
  setValue: (v: string) => void;
  variant: Variant;
};

const TabsCtx = createContext<Ctx | null>(null);

function useTabs() {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error("Tabs.* must be used inside <Tabs>");
  return ctx;
}

const PILL_MS = 320;
const PILL_TRANSFORM = `transform ${PILL_MS}ms ${EASE_OUT_CSS}`;

type IndicatorBox = { x: number; y: number; w: number; h: number };

function boxesNear(a: IndicatorBox, b: IndicatorBox, eps = 0.5) {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.w - b.w) < eps &&
    Math.abs(a.h - b.h) < eps
  );
}

function measureSelectedTab(list: HTMLElement, underline: boolean) {
  const selected = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  if (!selected) return null;
  const listRect = list.getBoundingClientRect();
  const tabRect = selected.getBoundingClientRect();
  const x = tabRect.left - listRect.left + list.scrollLeft;
  const y = tabRect.top - listRect.top + list.scrollTop;
  return {
    x,
    y: underline ? y + tabRect.height - 1 : y,
    w: tabRect.width,
    h: underline ? 1 : tabRect.height,
    indicatorClassName: selected.dataset.tabIndicatorClass ?? "",
  };
}

function readTransform(el: HTMLElement) {
  const raw = getComputedStyle(el).transform;
  if (!raw || raw === "none") return { x: 0, y: 0, sx: 1, sy: 1 };
  const m = new DOMMatrix(raw);
  return { x: m.e, y: m.f, sx: m.a, sy: m.d };
}

function visualBox(el: HTMLElement, layout: IndicatorBox): IndicatorBox {
  const { x, y, sx, sy } = readTransform(el);
  return { x, y, w: layout.w * sx, h: layout.h * sy };
}

function setIndicatorTransform(
  el: HTMLElement,
  x: number,
  y: number,
  sx: number,
  sy: number,
) {
  el.style.transformOrigin = "0 0";
  el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${sx}, ${sy})`;
}

/**
 * Morph the pill with a FLIP on transform only. Width/height snap to the
 * destination immediately and are inverted with scale, so size and position
 * interpolate together on the compositor and settle in one motion.
 */
function placeIndicator(
  el: HTMLElement,
  next: IndicatorBox,
  layoutRef: { current: IndicatorBox | null },
  opts: { animate: boolean; reduce: boolean },
) {
  const layout = layoutRef.current;
  if (!opts.animate || opts.reduce || !layout) {
    el.style.transition = "none";
    el.style.width = `${next.w}px`;
    el.style.height = `${next.h}px`;
    setIndicatorTransform(el, next.x, next.y, 1, 1);
    layoutRef.current = next;
    return;
  }

  const prev = visualBox(el, layout);
  const sx = next.w === 0 ? 1 : prev.w / next.w;
  const sy = next.h === 0 ? 1 : prev.h / next.h;
  el.style.transition = "none";
  el.style.width = `${next.w}px`;
  el.style.height = `${next.h}px`;
  setIndicatorTransform(el, prev.x, prev.y, sx, sy);
  void el.offsetWidth;
  el.style.transition = PILL_TRANSFORM;
  setIndicatorTransform(el, next.x, next.y, 1, 1);
  layoutRef.current = next;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  variant = "pill",
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const setValue = useCallback(
    (v: string) => {
      if (!controlled) setInternal(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange],
  );
  const contextValue = useMemo(
    () => ({ value: current, setValue, variant }),
    [current, setValue, variant],
  );
  return (
    <TabsCtx.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

const listClasses: Record<Variant, string> = {
  pill: "relative inline-flex items-center gap-1 rounded-full bg-card p-1",
  underline: "relative inline-flex items-center gap-1 border-b border-border",
  segment: "relative inline-flex items-center gap-0 rounded-lg bg-card p-0.5",
};

export function TabsList({
  children,
  className,
  indicatorClassName,
  trailing,
}: {
  children: ReactNode;
  className?: string;
  indicatorClassName?: string;
  /** Chrome that must stay outside the sliding pill's clip box (e.g. + / overflow). */
  trailing?: ReactNode;
}) {
  const { value, variant } = useTabs();
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const layoutRef = useRef<IndicatorBox | null>(null);
  const underline = variant === "underline";
  const radius = variant === "pill" ? "rounded-full" : "rounded-md";

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;

    const place = (animate: boolean) => {
      const box = measureSelectedTab(list, underline);
      if (!box) return;
      const layout = layoutRef.current;
      if (layout && boxesNear(box, layout)) return;
      const extra = box.indicatorClassName;
      const prevExtra = indicator.dataset.appliedIndicator ?? "";
      if (extra !== prevExtra) {
        for (const token of prevExtra.split(/\s+/).filter(Boolean)) {
          indicator.classList.remove(token);
        }
        for (const token of extra.split(/\s+/).filter(Boolean)) {
          indicator.classList.add(token);
        }
        indicator.dataset.appliedIndicator = extra;
      }
      placeIndicator(indicator, box, layoutRef, {
        animate,
        reduce: Boolean(reduce),
      });
    };

    place(layoutRef.current != null);

    let followRaf = 0;
    const follow = (animate: boolean) => {
      if (followRaf) return;
      followRaf = requestAnimationFrame(() => {
        followRaf = 0;
        place(animate);
      });
    };

    const selected = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const resizeObserver = new ResizeObserver(() => follow(true));
    if (selected) resizeObserver.observe(selected);
    const mutationObserver = new MutationObserver(() => follow(true));
    mutationObserver.observe(list, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    const scroller =
      list.querySelector<HTMLElement>("[data-center-tabs-scroll]") ?? list;
    const onScroll = () => follow(false);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(followRaf);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [reduce, underline, value]);

  const indicator = (
    <span
      ref={indicatorRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-0",
        underline ? "bg-primary" : cn("bg-primary", radius),
        indicatorClassName,
      )}
    />
  );
  const listClassName = cn(listClasses[variant], className);

  if (!trailing) {
    return (
      <div ref={listRef} role="tablist" className={listClassName}>
        {indicator}
        {children}
      </div>
    );
  }

  // Keep the pill's containing block on the tab track so overflow scroll
  // cannot paint the indicator over trailing chrome.
  return (
    <div role="tablist" className={listClassName}>
      <div
        ref={listRef}
        className="relative z-0 flex min-h-0 min-w-0 flex-1 items-center gap-[inherit] self-stretch overflow-hidden"
      >
        {indicator}
        {children}
      </div>
      <div className="relative z-20 flex shrink-0 items-center self-stretch">
        {trailing}
      </div>
    </div>
  );
}

type TabsTriggerProps = {
  value: string;
  children: ReactNode;
  className?: string;
  indicatorClassName?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value">;

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  function TabsTrigger(
    {
      value,
      children,
      className,
      indicatorClassName,
      onClick,
      type = "button",
      ...props
    },
    ref,
  ) {
    const { value: current, setValue, variant } = useTabs();
    const active = current === value;
    const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) setValue(value);
    };

    if (variant === "underline") {
      return (
        <button
          {...props}
          ref={ref}
          type={type}
          role="tab"
          aria-selected={active}
          data-tab-indicator-class={indicatorClassName}
          onClick={handleClick}
          className={cn(
            "relative isolate z-10 px-3 pb-2.5 pt-1 -mb-px text-sm font-medium min-h-[44px] inline-flex items-center",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          {children}
        </button>
      );
    }

    const radius = variant === "pill" ? "rounded-full" : "rounded-md";

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        role="tab"
        aria-selected={active}
        data-tab-indicator-class={indicatorClassName}
        onClick={handleClick}
        className={cn(
          "relative isolate z-10 inline-flex items-center justify-center whitespace-nowrap bg-transparent px-3.5 py-1.5 text-sm font-medium outline-none",
          active
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
          radius,
          className,
        )}
      >
        {children}
      </button>
    );
  },
);

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: current } = useTabs();
  const reduce = useReducedMotion();
  const active = current === value;
  // Inactive panels stay mounted but hidden, so their content (e.g. source
  // code) is present in the server-rendered HTML for crawlers and assistive
  // tech, instead of being dropped from the DOM.
  if (!active) {
    return (
      <div hidden className={className}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      key={value}
      initial={{ opacity: 0, y: reduce ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className={cn("mt-4", className)}
    >
      {children}
    </motion.div>
  );
}
