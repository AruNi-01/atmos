/**
 * Topological git-history lane layout, ported from Comet's `layout_graph`
 * (https://github.com/zeronsh/comet, MIT — see root NOTICE).
 * Commits must arrive child-before-parent (`git log --topo-order`).
 */

export const HISTORY_ROW_HEIGHT = 36;
export const HISTORY_HEADER_HEIGHT = 28;
export const HISTORY_LANE_SPACING = 12;
export const HISTORY_NODE_RADIUS = 3;
export const HISTORY_HEAD_RING_PADDING = 2;
export const HISTORY_STROKE_WIDTH = 1.5;
export const HISTORY_GRAPH_SIDE_PADDING = 5;
export const HISTORY_GRAPH_TRAILING_PADDING = 10;
export const HISTORY_GRAPH_ROW_OVERLAP = 0.75;

export const GIT_HISTORY_GRAPH_COLORS = [
  "var(--info)",
  "var(--chart-2)",
  "var(--success)",
  "var(--warning)",
  "var(--destructive)",
  "var(--muted-foreground)",
] as const;

export type GraphSegmentShape = "through" | "incoming" | "outgoing";

export type GraphSegment = {
  fromLane: number;
  toLane: number;
  colorId: number;
  shape: GraphSegmentShape;
};

export type GraphRow = {
  hash: string;
  nodeLane: number;
  nodeColorId: number;
  segments: GraphSegment[];
  isHead: boolean;
};

export type GraphLayout = {
  rows: GraphRow[];
  maxLaneCount: number;
};

type HistoryCommitLike = {
  hash: string;
  parent_hashes: string[];
};

type ActiveLane = {
  id: number;
  colorId: number;
  targetSha: string;
};

function laneIndex(lanes: ActiveLane[], id: number): number {
  const index = lanes.findIndex((lane) => lane.id === id);
  if (index < 0) {
    throw new Error("active Git history lane exists");
  }
  return index;
}

/**
 * Commits arrive child-before-parent. Active lanes point at the parent
 * commit that will eventually resolve each path.
 */
export function layoutGitHistoryGraph(
  commits: readonly HistoryCommitLike[],
  headSha: string | null | undefined,
): GraphLayout {
  const activeLanes: ActiveLane[] = [];
  let nextLaneId = 0;
  let nextColorId = 0;
  let maxLaneCount = 0;
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const before = activeLanes.slice();
    const incoming: number[] = [];
    for (let index = 0; index < before.length; index++) {
      if (before[index]!.targetSha === commit.hash) incoming.push(index);
    }
    const primaryIncoming = incoming[0];
    const nodeLane = primaryIncoming ?? before.length;
    const primaryLane =
      primaryIncoming === undefined ? undefined : before[primaryIncoming];
    const nodeColorId = primaryLane?.colorId ?? nextColorId++;
    const resolvedIds = new Set(incoming.map((index) => before[index]!.id));
    const nextLanes = before.filter((lane) => !resolvedIds.has(lane.id));
    const outgoing: Array<{ id: number; colorId: number }> = [];

    let primaryOutgoingId: number | undefined;
    const firstParent = commit.parent_hashes[0];
    if (firstParent) {
      const id = primaryLane?.id ?? nextLaneId++;
      const lane: ActiveLane = {
        id,
        colorId: nodeColorId,
        targetSha: firstParent,
      };
      nextLanes.splice(Math.min(nodeLane, nextLanes.length), 0, lane);
      primaryOutgoingId = id;
      outgoing.push({ id, colorId: lane.colorId });
    }

    let parentOffset = 1;
    for (const parentSha of commit.parent_hashes.slice(1)) {
      const existing = nextLanes.find((lane) => lane.targetSha === parentSha);
      if (existing) {
        outgoing.push({ id: existing.id, colorId: existing.colorId });
        continue;
      }
      const lane: ActiveLane = {
        id: nextLaneId++,
        colorId: nextColorId++,
        targetSha: parentSha,
      };
      const primaryIndex =
        primaryOutgoingId === undefined
          ? Math.min(nodeLane, nextLanes.length)
          : laneIndex(nextLanes, primaryOutgoingId);
      nextLanes.splice(
        Math.min(primaryIndex + parentOffset, nextLanes.length),
        0,
        lane,
      );
      parentOffset += 1;
      outgoing.push({ id: lane.id, colorId: lane.colorId });
    }

    const segments: GraphSegment[] = before
      .map((lane, fromLane) => ({ lane, fromLane }))
      .filter(({ lane }) => !resolvedIds.has(lane.id))
      .map(({ lane, fromLane }) => ({
        fromLane,
        toLane: laneIndex(nextLanes, lane.id),
        colorId: lane.colorId,
        shape: "through" as const,
      }));

    for (const fromLane of incoming) {
      segments.push({
        fromLane,
        toLane: nodeLane,
        colorId: before[fromLane]!.colorId,
        shape: "incoming",
      });
    }
    for (const item of outgoing) {
      segments.push({
        fromLane: nodeLane,
        toLane: laneIndex(nextLanes, item.id),
        colorId: item.colorId,
        shape: "outgoing",
      });
    }

    maxLaneCount = Math.max(maxLaneCount, before.length, nextLanes.length, nodeLane + 1);
    rows.push({
      hash: commit.hash,
      nodeLane,
      nodeColorId,
      segments,
      isHead: headSha === commit.hash,
    });

    activeLanes.length = 0;
    activeLanes.push(...nextLanes);
  }

  return { rows, maxLaneCount };
}

export function historyLaneX(lane: number): number {
  return HISTORY_GRAPH_SIDE_PADDING + HISTORY_NODE_RADIUS + lane * HISTORY_LANE_SPACING;
}

export function historyGraphWidth(laneCount: number): number {
  const count = Math.max(laneCount, 1);
  return (
    HISTORY_GRAPH_SIDE_PADDING +
    HISTORY_GRAPH_TRAILING_PADDING +
    HISTORY_NODE_RADIUS * 2 +
    (count - 1) * HISTORY_LANE_SPACING
  );
}

export function historyGraphColor(colorId: number): string {
  return GIT_HISTORY_GRAPH_COLORS[colorId % GIT_HISTORY_GRAPH_COLORS.length]!;
}
