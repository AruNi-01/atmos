"use client";

import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import {
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_GUTTER,
  TREE_BRANCH_MID_Y,
  TREE_BRANCH_RADIUS,
  TREE_BRANCH_TRUNK_X,
  TREE_DRAW_MS,
  TREE_EASE,
  TREE_LINE_WIDTH,
  treeReachPath,
} from "@/features/agent/lib/agent-tree-branch";
import { useTreeDrawIn } from "@/features/agent/hooks/use-tree-draw-in";

function strokeStyle(drawn: boolean, skip: boolean, durationMs: number, delayMs = 0) {
  if (skip || !drawn) {
    return {
      strokeDasharray: 1,
      strokeDashoffset: skip ? 0 : 1,
      transition: "none",
    };
  }
  return {
    strokeDasharray: 1,
    strokeDashoffset: 0,
    transition: `stroke-dashoffset ${durationMs}ms ${TREE_EASE} ${delayMs}ms`,
  };
}

function BranchSvg({
  isFirst,
  isLast,
  skip,
  durationMs,
}: {
  isFirst: boolean;
  isLast: boolean;
  skip: boolean;
  durationMs: number;
}) {
  const elbowDrawn = useTreeDrawIn(skip);
  const trunkDrawn = useTreeDrawIn(skip || isLast);
  const elbow = treeReachPath(isFirst ? TREE_BRANCH_FIRST_START_Y : 0, TREE_BRANCH_MID_Y);

  return (
    <svg
      data-tree-lines=""
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={TREE_BRANCH_GUTTER}
      height="100%"
      aria-hidden="true"
    >
      {!isLast ? (
        <line
          key="trunk"
          data-tree-stroke="trunk"
          x1={TREE_BRANCH_TRUNK_X}
          y1={TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS}
          x2={TREE_BRANCH_TRUNK_X}
          y2="100%"
          fill="none"
          stroke="var(--border)"
          strokeWidth={TREE_LINE_WIDTH}
          strokeLinecap="round"
          pathLength={1}
          style={strokeStyle(trunkDrawn, skip, durationMs)}
        />
      ) : null}
      <path
        key="elbow"
        data-tree-stroke="elbow"
        fill="none"
        stroke="var(--border)"
        strokeWidth={TREE_LINE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={elbow}
        pathLength={1}
        style={strokeStyle(elbowDrawn, skip, durationMs)}
      />
    </svg>
  );
}

export function AgentTreeBranch({
  isLast,
  isFirst = false,
  animate = false,
  durationMs = TREE_DRAW_MS,
  children,
}: {
  isLast: boolean;
  isFirst?: boolean;
  animate?: boolean;
  durationMs?: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const skip = !animate || Boolean(reduced);

  return (
    <div className="relative flex min-h-6 min-w-0">
      <div className="relative w-7 shrink-0 self-stretch overflow-visible" aria-hidden="true">
        <BranchSvg
          isFirst={isFirst}
          isLast={isLast}
          skip={skip}
          durationMs={durationMs}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
