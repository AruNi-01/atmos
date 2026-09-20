"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EASE_OUT } from "../../lib/ease";
import { useOverlayDismiss } from "../../lib/hooks/use-overlay-dismiss";
import { cn } from "../../lib/utils";

const INSTANT_TRANSITION: Transition = { duration: 0 };

// Spring with bounce powers the unfold/separation; per-property timings in the
// content choreograph it (see SelectContent). Mirrors bouncy-accordion's feel.
const CHEVRON_TRANSITION: Transition = { type: "spring", duration: 0.4, bounce: 0.3 };

const LIST_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
};
const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -6, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
};

type Placement = "bottom" | "top";

interface SelectContextValue {
  value: string | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  select: (value: string, opts?: { close?: boolean }) => void;
  register: (value: string, label: string) => void;
  unregister: (value: string) => void;
  labelFor: (value: string | undefined) => string | undefined;
  reduce: boolean;
  triggerId: string;
  listId: string;
  disabled: boolean;
  placement: Placement;
  setPlacement: (p: Placement) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext(component: string) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error(`${component} must be used within <Select>`);
  return ctx;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * Controlled open state of the panel. A layout that stacks selects can hold
   * this to keep exactly one panel open — the panel is absolutely positioned
   * inside its field, so two open at once paint over each other's options.
   */
  open?: boolean;
  /** Uncontrolled initial open state. Default false. */
  defaultOpen?: boolean;
  /**
   * Fires whenever the panel opens or closes. The panel is absolutely
   * positioned inside the field, so a layout that stacks selects has to know
   * which one is open to paint it above its neighbours.
   */
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  children,
}: SelectProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [internal, setInternal] = useState(defaultValue);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [placement, setPlacement] = useState<Placement>("bottom");

  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const openControlled = openProp !== undefined;
  const open = openControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!openControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, openControlled],
  );

  const select = useCallback(
    (next: string, opts?: { close?: boolean }) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
      if (opts?.close !== false) setOpen(false);
    },
    [controlled, onValueChange, setOpen],
  );

  const register = useCallback((v: string, label: string) => {
    setLabels((m) => (m.get(v) === label ? m : new Map(m).set(v, label)));
  }, []);
  const unregister = useCallback((v: string) => {
    setLabels((m) => {
      if (!m.has(v)) return m;
      const next = new Map(m);
      next.delete(v);
      return next;
    });
  }, []);

  const dismissSelect = useCallback(() => setOpen(false), [setOpen]);
  const isInsideSelect = useCallback(
    (node: Node | null) => {
      if (!node) return false;
      if (rootRef.current?.contains(node)) return true;
      const list = document.getElementById(`${baseId}-list`);
      return !!list?.contains(node);
    },
    [baseId],
  );
  const getSelectAnchor = useCallback(
    () => document.getElementById(`${baseId}-trigger`),
    [baseId],
  );
  useOverlayDismiss({
    open,
    onDismiss: dismissSelect,
    isInside: isInsideSelect,
    getAnchor: getSelectAnchor,
  });

  const ctx = useMemo<SelectContextValue>(
    () => ({
      value: current,
      open,
      setOpen,
      select,
      register,
      unregister,
      labelFor: (v) => (v === undefined ? undefined : labels.get(v)),
      reduce,
      triggerId: `${baseId}-trigger`,
      listId: `${baseId}-list`,
      disabled,
      placement,
      setPlacement,
    }),
    [
      current,
      open,
      setOpen,
      select,
      register,
      unregister,
      labels,
      reduce,
      baseId,
      disabled,
      placement,
    ],
  );

  return (
    <SelectContext.Provider value={ctx}>
      <div ref={rootRef} className={cn("relative", className)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export interface SelectTriggerProps {
  className?: string;
  children: ReactNode;
}

export function SelectTrigger({ className, children }: SelectTriggerProps) {
  const ctx = useSelectContext("SelectTrigger");
  const isTop = ctx.placement === "top";
  // edge facing the panel flattens then rounds; the far edge stays rounded.
  // All four corners are specified so none gets stranded when placement flips.
  const kf = ctx.open ? [0, 0, 12] : [12, 0, 12];
  const kfT: Transition = ctx.reduce
    ? { duration: 0 }
    : ctx.open
      ? { duration: 0.6, times: [0, 0.4, 1], ease: EASE_OUT }
      : { duration: 0.42, times: [0, 0.5, 1], ease: EASE_OUT };
  return (
    <motion.button
      type="button"
      id={ctx.triggerId}
      disabled={ctx.disabled}
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      aria-controls={ctx.listId}
      onClick={() => ctx.setOpen(!ctx.open)}
      // Gooey: the edge facing the panel snaps flat (panel attached) then rounds
      // back once the panel pulls away — the two pinch apart.
      initial={false}
      animate={{
        borderTopLeftRadius: isTop ? kf : 12,
        borderTopRightRadius: isTop ? kf : 12,
        borderBottomLeftRadius: isTop ? 12 : kf,
        borderBottomRightRadius: isTop ? 12 : kf,
      }}
      transition={{
        borderTopLeftRadius: isTop ? kfT : INSTANT_TRANSITION,
        borderTopRightRadius: isTop ? kfT : INSTANT_TRANSITION,
        borderBottomLeftRadius: isTop ? INSTANT_TRANSITION : kfT,
        borderBottomRightRadius: isTop ? INSTANT_TRANSITION : kfT,
      }}
      className={cn(
        "relative z-10 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors",
        "hover:border-(--color-border-strong) focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
      <motion.span
        aria-hidden
        animate={{ rotate: ctx.open ? 180 : 0 }}
        transition={ctx.reduce ? { duration: 0 } : CHEVRON_TRANSITION}
        className="text-muted-foreground"
      >
        <ChevronDown className="h-4 w-4" />
      </motion.span>
    </motion.button>
  );
}

export interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export function SelectValue({ placeholder, className }: SelectValueProps) {
  const ctx = useSelectContext("SelectValue");
  const label = ctx.labelFor(ctx.value);
  return (
    <span
      className={cn(label ? "text-foreground" : "text-muted-foreground", className)}
    >
      {label ?? placeholder ?? "Select"}
    </span>
  );
}

export interface SelectContentProps {
  className?: string;
  /** Rendered above the scrollable option list (search, back, etc). */
  header?: ReactNode;
  children: ReactNode;
}

export function SelectContent({ className, header, children }: SelectContentProps) {
  const ctx = useSelectContext("SelectContent");
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const [frame, setFrame] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const open = ctx.open;
  const { setPlacement } = ctx;

  useEffect(() => setPortalReady(true), []);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });

  useLayoutEffect(() => {
    const update = () => {
      const trigger = document.getElementById(ctx.triggerId);
      const node = innerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const h = node?.offsetHeight ?? height;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const nextPlacement = below < Math.max(h, 96) + 16 && above > below ? "top" : "bottom";
      setPlacement(nextPlacement);
      const width = Math.max(rect.width, 208);
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      setFrame(
        nextPlacement === "top"
          ? { left, width, bottom: window.innerHeight - rect.top + 8 }
          : { left, width, top: rect.bottom + 8 },
      );
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, ctx.triggerId, height, setPlacement]);

  const isTop = ctx.placement === "top";
  const nearRadius = open ? 12 : 0;
  const radiusT: Transition = open
    ? { duration: 0.3, ease: EASE_OUT, delay: 0.14 }
    : { duration: 0.16, ease: EASE_OUT };

  const panel = (
    <motion.div
      id={ctx.listId}
      role="listbox"
      aria-labelledby={ctx.triggerId}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={
        ctx.reduce
          ? { opacity: open ? 1 : 0, height: open ? height : 0 }
          : {
              opacity: open ? 1 : 0,
              height: open ? height : 0,
              borderTopLeftRadius: isTop ? 12 : nearRadius,
              borderTopRightRadius: isTop ? 12 : nearRadius,
              borderBottomLeftRadius: isTop ? nearRadius : 12,
              borderBottomRightRadius: isTop ? nearRadius : 12,
            }
      }
      transition={
        ctx.reduce
          ? { duration: 0.12 }
          : {
              opacity: open ? { duration: 0.18 } : { duration: 0.16, delay: 0.12 },
              height: open
                ? { type: "spring", duration: 0.42, bounce: 0.14 }
                : { duration: 0.26, ease: EASE_OUT, delay: 0.14 },
              borderTopLeftRadius: isTop ? INSTANT_TRANSITION : radiusT,
              borderTopRightRadius: isTop ? INSTANT_TRANSITION : radiusT,
              borderBottomLeftRadius: isTop ? radiusT : INSTANT_TRANSITION,
              borderBottomRightRadius: isTop ? radiusT : INSTANT_TRANSITION,
            }
      }
      style={{
        position: "fixed",
        left: frame?.left ?? 0,
        width: frame?.width ?? 208,
        top: frame?.top,
        bottom: frame?.bottom,
        transformOrigin: isTop ? "bottom" : "top",
        overflow: "hidden",
        pointerEvents: open ? "auto" : "none",
        visibility: frame ? "visible" : "hidden",
      }}
      className={cn(
        "z-[9999] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
    >
      <motion.div
        ref={innerRef}
        variants={ctx.reduce ? undefined : LIST_VARIANTS}
        initial={false}
        animate={open ? "show" : "hidden"}
        className="flex max-h-80 flex-col"
      >
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="min-h-0 overflow-y-auto p-1">{children}</div>
      </motion.div>
    </motion.div>
  );

  if (!portalReady) return null;
  return createPortal(panel, document.body);
}

export interface SelectItemProps {
  value: string;
  disabled?: boolean;
  className?: string;
  closeOnSelect?: boolean;
  children: ReactNode;
}

export function SelectItem({
  value,
  disabled = false,
  className,
  closeOnSelect = true,
  children,
}: SelectItemProps) {
  const ctx = useSelectContext("SelectItem");
  const selected = ctx.value === value;
  const label = typeof children === "string" ? children : value;

  useLayoutEffect(() => {
    ctx.register(value, label);
    return () => ctx.unregister(value);
  }, [ctx.register, ctx.unregister, value, label]);

  return (
    <motion.li variants={ctx.reduce ? undefined : ITEM_VARIANTS}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        onClick={() => ctx.select(value, { close: closeOnSelect })}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors",
          selected
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        {children}
        {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      </button>
    </motion.li>
  );
}
