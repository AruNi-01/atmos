"use client";

import React from "react";
import { useReducedMotion } from "motion/react";

const TREE_BRANCH_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const TREE_BRANCH_DURATION_MS = 240;

/**
 * Expand/collapse folder children as one height group.
 *
 * First lazy expand: parent sets `open` only after children exist. We mount
 * content at 0fr, then double-rAF to 1fr so the enter transition always runs
 * (Motion height:"auto" often skipped that path). Collapse keeps cached rows
 * mounted until the close transition finishes — nestTreeItemsByParent clears
 * nested rows on collapse in the same render as `open={false}`.
 */
export function FileTreeBranch({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const durationMs = reduceMotion ? 0 : TREE_BRANCH_DURATION_MS;

  const cacheRef = React.useRef<React.ReactNode>(null);
  if (open) {
    cacheRef.current = children;
  }

  const [renderChildren, setRenderChildren] = React.useState(false);
  const [visualOpen, setVisualOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRenderChildren(true);
      return;
    }

    setVisualOpen(false);
    if (durationMs === 0) {
      setRenderChildren(false);
      return;
    }
    const timer = window.setTimeout(() => setRenderChildren(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [open, durationMs]);

  // Wait until content is mounted at 0fr, then open — otherwise visualOpen can
  // win the race and children pop in at full height with no enter transition.
  React.useEffect(() => {
    if (!open || !renderChildren) return;

    if (reduceMotion) {
      setVisualOpen(true);
      return;
    }

    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => setVisualOpen(true));
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [open, renderChildren, reduceMotion]);

  const content = open ? children : cacheRef.current;

  return (
    <div
      role="group"
      className="grid overflow-hidden"
      style={{
        gridTemplateRows: visualOpen ? "1fr" : "0fr",
        opacity: visualOpen ? 1 : 0,
        transition:
          durationMs > 0
            ? [
                `grid-template-rows ${durationMs}ms ${TREE_BRANCH_EASE}`,
                `opacity ${Math.round(durationMs * 0.75)}ms ${TREE_BRANCH_EASE}`,
              ].join(", ")
            : undefined,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {renderChildren ? content : null}
      </div>
    </div>
  );
}
