"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React from "react";

export type MotionSlideMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  children?: MotionSlideMenuItem[];
  disabled?: boolean;
  variant?: "default" | "destructive";
  onSelect?: (item: MotionSlideMenuItem) => void;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  className?: string;
};

export type MotionSlideMenuProps = {
  items: MotionSlideMenuItem[];
  onItemSelect?: (item: MotionSlideMenuItem) => void;
  path?: string[];
  defaultPath?: string[];
  onPathChange?: (path: string[]) => void;
  backLabel?: string;
  rootLabel?: string;
  springDuration?: number;
  itemClassName?: string;
  maxHeight?: React.CSSProperties["maxHeight"];
  className?: string;
};

function findLevel(items: MotionSlideMenuItem[], path: string[]): MotionSlideMenuItem[] {
  let level = items;
  for (const id of path) {
    const next = level.find((item) => item.id === id);
    if (!next?.children) return level;
    level = next.children;
  }
  return level;
}

function findItem(items: MotionSlideMenuItem[], id: string): MotionSlideMenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const nested = findItem(item.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function MotionSlideMenu({
  items,
  onItemSelect,
  path: controlledPath,
  defaultPath = [],
  onPathChange,
  backLabel = "Back to",
  rootLabel = "main menu",
  springDuration = 0.28,
  itemClassName,
  maxHeight = "100%",
  className,
}: MotionSlideMenuProps) {
  const reduceMotion = useReducedMotion();
  const [uncontrolledPath, setUncontrolledPath] = React.useState(defaultPath);
  const path = controlledPath ?? uncontrolledPath;
  const setPath = (next: string[]) => {
    if (controlledPath === undefined) setUncontrolledPath(next);
    onPathChange?.(next);
  };

  const levelItems = findLevel(items, path);
  const parent = path.length > 0 ? findItem(items, path[path.length - 1]!) : undefined;
  const heading = parent?.label ?? rootLabel;
  const [direction, setDirection] = React.useState(1);

  const openItem = (item: MotionSlideMenuItem) => {
    if (item.disabled) return;
    if (item.children?.length) {
      setDirection(1);
      setPath([...path, item.id]);
      return;
    }
    item.onSelect?.(item);
    onItemSelect?.(item);
  };

  const goBack = () => {
    if (path.length === 0) return;
    setDirection(-1);
    setPath(path.slice(0, -1));
  };

  const duration = reduceMotion ? 0 : springDuration;
  const offset = 60;

  return (
    <nav
      className={className}
      data-testid="motion-slide-menu"
      aria-label={rootLabel}
      style={{
        position: "relative",
        overflow: "hidden",
        height: "100%",
        maxHeight,
      }}
    >
      <AnimatePresence custom={direction} initial={false} mode="popLayout">
        <motion.div
          key={path.join("/") || "root"}
          custom={direction}
          initial={
            reduceMotion
              ? { opacity: 1 }
              : { x: `${direction * offset}%`, y: 8, opacity: 0 }
          }
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : { x: `${direction * -offset}%`, y: 8, opacity: 0 }
          }
          transition={{ duration, ease: [0.23, 1, 0.32, 1] }}
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {path.length > 0 ? (
            <button
              type="button"
              aria-label={`${backLabel} ${heading}`}
              onClick={goBack}
              style={headerButtonStyle}
            >
              <span aria-hidden style={{ width: 16, display: "inline-flex" }}>
                ‹
              </span>
              <span style={{ display: "inline-flex", width: 16, height: 16, flexShrink: 0 }}>
                {parent?.icon}
              </span>
              <span style={{ fontWeight: 600 }}>{heading}</span>
            </button>
          ) : null}
          <div
            role="list"
            style={{
              overflow: "auto",
              flex: 1,
              paddingLeft: path.length > 0 ? 8 : 0,
            }}
          >
            {levelItems.map((item) => {
              const hasChildren = Boolean(item.children?.length);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  disabled={item.disabled}
                  data-menu-id={item.id}
                  className={itemClassName}
                  onClick={() => openItem(item)}
                  style={{
                    ...rowButtonStyle,
                    color: item.variant === "destructive" ? "#ef4444" : "inherit",
                    opacity: item.disabled ? 0.45 : 1,
                  }}
                >
                  <span style={{ display: "inline-flex", width: 16, height: 16, flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
                  {hasChildren ? <span aria-hidden style={{ opacity: 0.5 }}>›</span> : null}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </nav>
  );
}

const headerButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  fontSize: 12,
  lineHeight: "18px",
  padding: "8px",
  marginBottom: 4,
  border: "none",
  borderRadius: 8,
  color: "inherit",
  background: "transparent",
  cursor: "pointer",
};

const rowButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  fontSize: 12,
  lineHeight: "18px",
  padding: "6px 8px",
  marginBottom: 2,
  border: "none",
  borderRadius: 8,
  background: "transparent",
  cursor: "pointer",
};
