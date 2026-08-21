"use client";

import {
  HISTORY_GRAPH_ROW_OVERLAP,
  HISTORY_ROW_HEIGHT,
  HISTORY_STROKE_WIDTH,
  GIT_HISTORY_GRAPH_COLORS,
  historyGraphColor,
  historyLaneX,
  layoutGitHistoryGraph,
} from "@/features/git/lib/git-history-graph";

export function GitHistoryGraphSvg({
  rows,
  width,
}: {
  rows: ReturnType<typeof layoutGitHistoryGraph>["rows"];
  width: number;
}) {
  const height = rows.length * HISTORY_ROW_HEIGHT;
  const middle = HISTORY_ROW_HEIGHT / 2;
  const colorCount = GIT_HISTORY_GRAPH_COLORS.length;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={width}
      height={height}
    >
      {Array.from({ length: colorCount }, (_, colorIndex) => {
        const d: string[] = [];
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index]!;
          const originY = index * HISTORY_ROW_HEIGHT;
          for (const segment of row.segments) {
            if (segment.colorId % colorCount !== colorIndex) continue;
            const fromX = historyLaneX(segment.fromLane);
            const toX = historyLaneX(segment.toLane);
            if (segment.shape === "incoming") {
              d.push(
                `M ${fromX} ${originY - HISTORY_GRAPH_ROW_OVERLAP} C ${fromX} ${originY + middle * 0.55}, ${toX} ${originY + middle * 0.55}, ${toX} ${originY + middle}`,
              );
            } else if (segment.shape === "outgoing") {
              d.push(
                `M ${fromX} ${originY + middle} C ${fromX} ${originY + middle * 1.45}, ${toX} ${originY + middle * 1.45}, ${toX} ${originY + HISTORY_ROW_HEIGHT + HISTORY_GRAPH_ROW_OVERLAP}`,
              );
            } else if (segment.fromLane === segment.toLane) {
              d.push(
                `M ${fromX} ${originY - HISTORY_GRAPH_ROW_OVERLAP} L ${toX} ${originY + HISTORY_ROW_HEIGHT + HISTORY_GRAPH_ROW_OVERLAP}`,
              );
            } else {
              d.push(
                `M ${fromX} ${originY - HISTORY_GRAPH_ROW_OVERLAP} C ${fromX} ${originY + middle}, ${toX} ${originY + middle}, ${toX} ${originY + HISTORY_ROW_HEIGHT + HISTORY_GRAPH_ROW_OVERLAP}`,
              );
            }
          }
        }
        if (d.length === 0) return null;
        return (
          <path
            key={colorIndex}
            d={d.join(" ")}
            fill="none"
            stroke={historyGraphColor(colorIndex)}
            strokeWidth={HISTORY_STROKE_WIDTH}
          />
        );
      })}
    </svg>
  );
}

