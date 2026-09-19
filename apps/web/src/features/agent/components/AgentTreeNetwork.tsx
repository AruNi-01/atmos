"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  TREE_BRANCH_END_X,
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_GUTTER,
  TREE_DRAW_MS,
  TREE_EASE,
  TREE_LINE_WIDTH,
  treeEnterDelayMs,
  treeReachPath,
} from "@/features/agent/lib/agent-tree-branch";
import { useTreeDrawIn } from "@/features/agent/hooks/use-tree-draw-in";

function TreeReachSegment({
  fromY,
  midY,
  skip,
  delayMs,
}: {
  fromY: number;
  midY: number;
  skip: boolean;
  delayMs: number;
}) {
  const drawn = useTreeDrawIn(skip);
  const d = treeReachPath(fromY, midY);
  return (
    <path
      data-tree-reach=""
      fill="none"
      stroke="var(--border)"
      strokeWidth={TREE_LINE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      d={d}
      pathLength={1}
      style={
        skip || !drawn
          ? {
              strokeDasharray: 1,
              strokeDashoffset: skip ? 0 : 1,
              transition: "none",
            }
          : {
              strokeDasharray: 1,
              strokeDashoffset: 0,
              transition: `stroke-dashoffset ${TREE_DRAW_MS}ms ${TREE_EASE} ${delayMs}ms`,
            }
      }
    />
  );
}

export function AgentTreeNetwork({ animate }: { animate: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mids, setMids] = useState<number[]>([]);
  const [height, setHeight] = useState(0);
  const reduced = useReducedMotion();
  const skip = !animate || Boolean(reduced);
  const delayRef = useRef<number[]>([]);
  if (skip) {
    delayRef.current = [];
  } else if (delayRef.current.length !== mids.length) {
    const previous = delayRef.current.length;
    delayRef.current = mids.map((_, index) => (
      index < previous ? delayRef.current[index]! : treeEnterDelayMs(index, previous, mids.length)
    ));
  }
  const delays = delayRef.current;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const host = svg?.parentElement;
    if (!host) return;

    const measure = () => {
      const rows = [...host.querySelectorAll<HTMLElement>(":scope > [data-tree-row]")];
      const nextMids = rows.map((row) => {
        const header = row.querySelector<HTMLElement>("[data-tree-header]") ?? row;
        return row.offsetTop + header.offsetHeight / 2;
      });
      const nextHeight = Math.max(host.scrollHeight, host.offsetHeight);
      setMids((current) => {
        if (
          current.length === nextMids.length
          && current.every((value, index) => Math.abs(value - (nextMids[index] ?? 0)) < 0.5)
        ) {
          return current;
        }
        return nextMids;
      });
      setHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(host);
    const mutation = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(measure);
    mutation?.observe(host, { childList: true });
    return () => {
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      data-agent-tree-network=""
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={TREE_BRANCH_GUTTER}
      height={Math.max(height, TREE_BRANCH_END_X)}
      aria-hidden="true"
    >
      {mids.map((midY, index) => (
        <TreeReachSegment
          key={index}
          fromY={index === 0 ? TREE_BRANCH_FIRST_START_Y : mids[index - 1]!}
          midY={midY}
          skip={skip}
          delayMs={skip ? 0 : delays[index] ?? 0}
        />
      ))}
    </svg>
  );
}
