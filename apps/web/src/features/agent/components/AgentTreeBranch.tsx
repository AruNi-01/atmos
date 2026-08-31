"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import {
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_MID_Y,
  TREE_BRANCH_RADIUS,
  TREE_BRANCH_WIDTH,
  TREE_CLIP_FULL,
  TREE_CLIP_VERTICAL_FULL,
  TREE_CLIP_VERTICAL_ONLY,
  TREE_EASE,
  TREE_LINE_MS,
  TREE_TRUNK_MS,
} from "@/features/agent/lib/agent-tree-branch";

function useDrawIn(skip: boolean): boolean {
  const [drawn, setDrawn] = useState(skip);

  useEffect(() => {
    if (skip) {
      if (!drawn) setDrawn(true);
      return;
    }
    if (drawn) return;
    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [drawn, skip]);

  return drawn;
}

function BranchTrunk({ skip }: { skip: boolean }) {
  const grown = useDrawIn(skip);

  return (
    <span
      data-tree-trunk=""
      className="absolute bottom-0 left-2 w-px bg-background motion-reduce:transition-none"
      style={{
        top: TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS,
        backgroundImage: "linear-gradient(var(--border), var(--border))",
        transform: grown ? "scaleY(1)" : "scaleY(0)",
        transformOrigin: "top",
        transition: skip ? undefined : `transform ${TREE_TRUNK_MS}ms ${TREE_EASE}`,
      }}
    />
  );
}

function BranchElbow({ isFirst, skip }: { isFirst: boolean; skip: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(skip);
  const [drawn, setDrawn] = useState(skip);
  const originY = isFirst ? TREE_BRANCH_FIRST_START_Y : 0;
  const height = TREE_BRANCH_MID_Y - originY;

  useEffect(() => {
    if (skip) {
      played.current = true;
      setDrawn(true);
      return;
    }
    if (played.current) return;
    const el = ref.current;
    if (!el) return;
    const anim = el.animate(
      [
        { clipPath: TREE_CLIP_VERTICAL_ONLY },
        { clipPath: TREE_CLIP_VERTICAL_FULL, offset: 0.55 },
        { clipPath: TREE_CLIP_FULL },
      ],
      { duration: TREE_LINE_MS, easing: TREE_EASE, fill: "forwards" },
    );
    const timer = window.setTimeout(() => {
      played.current = true;
      setDrawn(true);
    }, TREE_LINE_MS);
    return () => {
      window.clearTimeout(timer);
      anim.commitStyles();
      anim.cancel();
    };
  }, [skip]);

  return (
    <span
      ref={ref}
      data-tree-elbow=""
      className="absolute left-2 z-[1] box-border border-border bg-background"
      style={{
        top: originY,
        width: TREE_BRANCH_WIDTH,
        height,
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        borderBottomLeftRadius: TREE_BRANCH_RADIUS,
        clipPath: skip || drawn ? TREE_CLIP_FULL : TREE_CLIP_VERTICAL_ONLY,
      }}
    />
  );
}

export function AgentTreeBranch({
  isLast,
  isFirst = false,
  animate = false,
  children,
}: {
  isLast: boolean;
  isFirst?: boolean;
  animate?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const skip = !animate || Boolean(reduced);

  return (
    <div className="relative flex min-h-6 min-w-0">
      <div className="relative w-7 shrink-0 self-stretch overflow-visible" aria-hidden="true">
        {!isLast ? <BranchTrunk key="trunk" skip={skip} /> : null}
        <BranchElbow key="elbow" isFirst={isFirst} skip={skip} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
