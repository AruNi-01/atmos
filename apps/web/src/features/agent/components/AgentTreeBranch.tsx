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
  TREE_LINE_ALPHA,
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
  delayMs,
}: {
  isFirst: boolean;
  isLast: boolean;
  skip: boolean;
  durationMs: number;
  delayMs: number;
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
      {/* Opaque ink faded once by the group — see TREE_LINE_ALPHA. Butt caps keep
          the trunk inside its own row so neighbours abut instead of overlapping. */}
      <g
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={TREE_LINE_WIDTH}
        strokeLinecap="butt"
        strokeLinejoin="round"
        opacity={TREE_LINE_ALPHA}
      >
        {!isLast ? (
          <line
            key="trunk"
            data-tree-stroke="trunk"
            x1={TREE_BRANCH_TRUNK_X}
            y1={TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS}
            x2={TREE_BRANCH_TRUNK_X}
            y2="100%"
            pathLength={1}
            style={strokeStyle(trunkDrawn, skip, durationMs, delayMs)}
          />
        ) : null}
        <path
          key="elbow"
          data-tree-stroke="elbow"
          d={elbow}
          pathLength={1}
          style={strokeStyle(elbowDrawn, skip, durationMs, delayMs)}
        />
      </g>
    </svg>
  );
}

export function AgentTreeBranch({
  isLast,
  isFirst = false,
  animate = false,
  durationMs = TREE_DRAW_MS,
  delayMs = 0,
  children,
}: {
  isLast: boolean;
  isFirst?: boolean;
  animate?: boolean;
  durationMs?: number;
  delayMs?: number;
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
          delayMs={delayMs}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
