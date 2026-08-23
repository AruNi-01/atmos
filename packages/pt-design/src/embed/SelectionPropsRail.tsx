"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React from "react";
import type { ChromeTokens } from "./chrome";
import { CatalogVariantIcon } from "./catalog-icons";
import {
  STYLE_PANEL_SELECTOR,
  type SelectionPropGroup,
} from "./selection-props";

const EASE = [0.16, 1, 0.3, 1] as const;
const PRESS = { scale: 0.96 };
const FALLBACK_TOP = 64;
const FALLBACK_LEFT = 220;
const GAP = 8;

type Anchor = { top: number; left: number };

export function SelectionPropsRail({
  groups,
  chrome,
  instanceId,
  onSelect,
}: {
  groups: SelectionPropGroup[];
  chrome: ChromeTokens;
  instanceId: string;
  onSelect: (group: SelectionPropGroup, optionId: string) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  React.useLayoutEffect(() => {
    setOpenId(null);
  }, [instanceId]);

  React.useLayoutEffect(() => {
    const host = rootRef.current?.closest("[data-testid='pt-design-board']") as HTMLElement | null;
    if (!host) return;

    let frame = 0;
    const measure = () => {
      const panel = host.querySelector(STYLE_PANEL_SELECTOR) as HTMLElement | null;
      const hostRect = host.getBoundingClientRect();
      if (!panel) {
        setAnchor((prev) => prev ?? { top: FALLBACK_TOP, left: FALLBACK_LEFT });
        return;
      }
      const rect = panel.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) {
        setAnchor((prev) => prev ?? { top: FALLBACK_TOP, left: FALLBACK_LEFT });
        return;
      }
      const next = {
        top: Math.round(rect.top - hostRect.top + 10),
        left: Math.round(rect.right - hostRect.left + GAP),
      };
      setAnchor((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
    };

    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [instanceId, groups.length]);

  React.useEffect(() => {
    if (!openId) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-testid='pt-design-selection-props']")) return;
      setOpenId(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  if (groups.length === 0) return null;

  const duration = reduceMotion ? 0 : 0.22;

  return (
    <div
      ref={rootRef}
      className="pt-design-prop-rail"
      data-testid="pt-design-selection-props"
      data-instance-id={instanceId}
      style={
        {
          top: anchor?.top ?? FALLBACK_TOP,
          left: anchor?.left ?? FALLBACK_LEFT,
          opacity: anchor ? 1 : 0,
          "--pt-prop-bg": chrome.card,
          "--pt-prop-fg": chrome.fg,
          "--pt-prop-border": chrome.border,
          "--pt-prop-muted": chrome.muted,
          "--pt-prop-muted-fg": chrome.mutedFg,
        } as React.CSSProperties
      }
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {groups.map((group) => {
        const open = openId === group.id;
        const current = group.options.find((opt) => opt.id === group.value);
        const title = current ? `${group.label}: ${current.label}` : group.label;
        return (
          <div key={group.id} className="pt-design-prop-row" data-testid={`pt-design-prop-group-${group.id}`}>
            <motion.button
              type="button"
              className="pt-design-prop-trigger"
              data-open={open ? "true" : "false"}
              title={title}
              aria-label={title}
              aria-expanded={open}
              aria-haspopup="listbox"
              whileTap={reduceMotion ? undefined : PRESS}
              transition={{ duration: reduceMotion ? 0 : 0.12, ease: EASE }}
              onClick={() => setOpenId((current) => (current === group.id ? null : group.id))}
            >
              <PropGlyph group={group} />
            </motion.button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  key={`${group.id}-options`}
                  className="pt-design-prop-options"
                  role="listbox"
                  aria-label={group.label}
                  initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={{ duration, ease: EASE }}
                  style={{ transformOrigin: "left center" }}
                >
                  {group.options.map((option) => {
                    const selected = option.id === group.value;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-testid={`pt-design-prop-option-${group.id}-${option.id}`}
                        className="pt-design-prop-option"
                        data-selected={selected ? "true" : "false"}
                        onClick={() => onSelect(group, option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function PropGlyph({ group }: { group: SelectionPropGroup }) {
  if (group.kind === "variant") {
    return <CatalogVariantIcon variant={group.value} size={14} />;
  }
  if (group.kind === "size") {
    const current = group.options.find((opt) => opt.id === group.value);
    return <span className="pt-design-prop-size">{current?.label ?? "M"}</span>;
  }
  return <span className="pt-design-prop-size">{group.value === "true" ? "On" : "Off"}</span>;
}
