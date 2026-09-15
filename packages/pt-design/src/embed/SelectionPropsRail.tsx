"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React from "react";
import type { ChromeTokens } from "./chrome";
import { CatalogVariantIcon } from "./catalog-icons";
import {
  MOBILE_EXCALIDRAW_SELECTOR,
  STYLE_PANEL_SELECTOR,
  railAnchorFromLayout,
  type RailAnchor,
  type RailBox,
  type SelectionPropGroup,
} from "./selection-props";

const EASE = [0.16, 1, 0.3, 1] as const;
const PRESS = { scale: 0.96 };

export function SelectionPropsRail({
  groups,
  chrome,
  nodeId,
  onSelect,
}: {
  groups: SelectionPropGroup[];
  chrome: ChromeTokens;
  nodeId: string;
  onSelect: (group: SelectionPropGroup, optionId: string) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = React.useState<RailAnchor | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  React.useLayoutEffect(() => {
    setOpenId(null);
  }, [nodeId]);

  React.useLayoutEffect(() => {
    const host = rootRef.current?.closest("[data-testid='pt-design-board']") as HTMLElement | null;
    if (!host) return;

    let frame = 0;
    const measure = () => {
      const next = railAnchorFromLayout({
        host: boxOf(host.getBoundingClientRect()),
        mobile: Boolean(host.querySelector(MOBILE_EXCALIDRAW_SELECTOR)),
        stylePanel: visibleBox(host.querySelector(STYLE_PANEL_SELECTOR)),
        colorTool: visibleBox(mobileColorTool(host)),
      });
      setAnchor((prev) => (sameAnchor(prev, next) ? prev : next));
    };

    const tick = () => {
      measure();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [nodeId, groups.length]);

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
  const placement = anchor?.placement ?? "side";
  const from = placement === "bottom" ? { opacity: 0, y: 12 } : { opacity: 0, x: -12 };
  const leave = placement === "bottom" ? { opacity: 0, y: 8 } : { opacity: 0, x: -8 };

  return (
    <div
      ref={rootRef}
      className="pt-design-prop-rail"
      data-testid="pt-design-selection-props"
      data-node-id={nodeId}
      data-placement={placement}
      style={
        {
          top: placement === "bottom" ? "auto" : (anchor?.top ?? 64),
          left: placement === "bottom" ? "auto" : (anchor?.left ?? 220),
          right: placement === "bottom" ? (anchor?.right ?? 56) : "auto",
          bottom: placement === "bottom" ? (anchor?.bottom ?? 76) : "auto",
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
              onClick={() => setOpenId((currentOpen) => (currentOpen === group.id ? null : group.id))}
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
                  initial={reduceMotion ? { opacity: 1 } : from}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : leave}
                  transition={{ duration, ease: EASE }}
                  style={{ transformOrigin: placement === "bottom" ? "center bottom" : "left center" }}
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
  if (group.kind === "radius") {
    return <RadiusGlyph value={group.value} />;
  }
  return <span className="pt-design-prop-size">{group.value === "true" ? "On" : "Off"}</span>;
}

function RadiusGlyph({ value }: { value: string }) {
  const rx = value === "none" ? 0 : value === "md" ? 3.5 : value === "lg" ? 5 : 2.25;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="11"
        height="11"
        rx={rx}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function mobileColorTool(host: HTMLElement): Element | null {
  const content = host.querySelector(".App-toolbar-content");
  if (!(content instanceof HTMLElement)) return null;
  const hostRect = host.getBoundingClientRect();
  const midY = hostRect.top + hostRect.height * 0.45;
  for (const child of content.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains("main-menu-trigger")) continue;
    if (child.classList.contains("pt-design-top-right")) continue;
    const rect = child.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.bottom < midY) continue;
    return child;
  }
  return null;
}

function visibleBox(el: Element | null): RailBox | null {
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return boxOf(rect);
}

function boxOf(rect: DOMRect): RailBox {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function sameAnchor(prev: RailAnchor | null, next: RailAnchor): boolean {
  return (
    prev?.placement === next.placement &&
    prev.top === next.top &&
    prev.left === next.left &&
    prev.right === next.right &&
    prev.bottom === next.bottom
  );
}
