"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import React from "react";

export type MotionSlideMenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: MotionSlideMenuItem[];
  disabled?: boolean;
  variant?: "default" | "destructive";
  insertType?: string;
  insertVariant?: string;
  onSelect?: (item: MotionSlideMenuItem) => void;
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
  const pathKey = path.join("/") || "root";
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const scrollMemory = React.useRef<Record<string, number>>({});

  const moveTo = (next: string[], nextDirection: number) => {
    const list = listRef.current;
    if (list) scrollMemory.current[pathKey] = list.scrollTop;
    setDirection(nextDirection);
    setPath(next);
  };

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = scrollMemory.current[pathKey] ?? 0;
  }, [pathKey]);

  const openItem = (item: MotionSlideMenuItem) => {
    if (item.disabled) return;
    if (item.children?.length) {
      moveTo([...path, item.id], 1);
      return;
    }
    item.onSelect?.(item);
    onItemSelect?.(item);
  };

  const goBack = () => {
    if (path.length === 0) return;
    moveTo(path.slice(0, -1), -1);
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
          initial={reduceMotion ? { opacity: 1 } : { x: `${direction * offset}%`, y: 8, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { x: `${direction * -offset}%`, y: 8, opacity: 0 }}
          transition={{ duration, ease: [0.23, 1, 0.32, 1] }}
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {path.length > 0 ? (
            <button
              type="button"
              className="pt-design-catalog-back"
              aria-label={`${backLabel} ${heading}`}
              onClick={goBack}
            >
              <span aria-hidden>‹</span>
              <span className="pt-design-catalog-row__icon">{parent?.icon}</span>
              <span className="pt-design-catalog-back__label">{heading}</span>
            </button>
          ) : null}
          <div
            ref={listRef}
            role="list"
            data-menu-path={pathKey}
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
                  data-pt-insert={item.insertType}
                  data-pt-variant={item.insertVariant}
                  className={[itemClassName, item.className].filter(Boolean).join(" ")}
                  onClick={() => openItem(item)}
                  style={{
                    color: item.variant === "destructive" ? "#ef4444" : undefined,
                    opacity: item.disabled ? 0.45 : 1,
                  }}
                >
                  <span className="pt-design-catalog-row__icon">{item.icon}</span>
                  <span className="pt-design-catalog-row__label">{item.label}</span>
                  {hasChildren ? (
                    <span className="pt-design-catalog-row__chevron" aria-hidden>
                      ›
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </nav>
  );
}
