import { describe, expect, test } from "bun:test";
import { HISTORY_COLUMN_MINS } from "./git-history-columns";
import {
  historyGraphWidth,
  layoutGitHistoryGraph,
  type GraphRow,
} from "./git-history-graph";

function commit(hash: string, parents: string[]) {
  return { hash, parent_hashes: parents };
}

function compactRow(row: GraphRow) {
  return {
    hash: row.hash,
    nodeLane: row.nodeLane,
    nodeColorId: row.nodeColorId,
    isHead: row.isHead,
    segments: row.segments.map((segment) => ({
      fromLane: segment.fromLane,
      toLane: segment.toLane,
      colorId: segment.colorId,
      shape: segment.shape,
    })),
  };
}

describe("layoutGitHistoryGraph", () => {
  test("assigns a side lane for a merge that splits then rejoins", () => {
    const layout = layoutGitHistoryGraph(
      [
        commit("m", ["b", "c"]),
        commit("b", ["a"]),
        commit("c", ["a"]),
        commit("a", []),
      ],
      "m",
    );

    expect(layout.maxLaneCount).toBeGreaterThanOrEqual(2);
    expect(layout.rows.map((row) => row.hash)).toEqual(["m", "b", "c", "a"]);
    expect(layout.rows[0]).toMatchObject({
      nodeLane: 0,
      isHead: true,
    });
    expect(layout.rows[1]?.nodeLane).toBe(0);
    expect(layout.rows[2]?.nodeLane).toBe(1);
    expect(layout.rows[3]?.nodeLane).toBe(0);

    const mergeOutgoing = layout.rows[0]!.segments.filter(
      (segment) => segment.shape === "outgoing",
    );
    expect(mergeOutgoing).toHaveLength(2);
    expect(new Set(mergeOutgoing.map((segment) => segment.toLane))).toEqual(
      new Set([0, 1]),
    );

    const rootIncoming = layout.rows[3]!.segments.filter(
      (segment) => segment.shape === "incoming",
    );
    expect(rootIncoming).toHaveLength(2);
    expect(new Set(rootIncoming.map((segment) => segment.fromLane))).toEqual(
      new Set([0, 1]),
    );
  });

  test("keeps the prefix layout stable when older commits are appended", () => {
    const prefix = [
      commit("m", ["b", "c"]),
      commit("b", ["a"]),
    ];
    const full = [
      ...prefix,
      commit("c", ["a"]),
      commit("a", []),
    ];

    const prefixLayout = layoutGitHistoryGraph(prefix, "m");
    const fullLayout = layoutGitHistoryGraph(full, "m");

    expect(fullLayout.rows.slice(0, prefix.length).map(compactRow)).toEqual(
      prefixLayout.rows.map(compactRow),
    );
  });
});

describe("git history table columns", () => {
  test("graph header column is wider than a single-lane drawing", () => {
    expect(historyGraphWidth(1)).toBeLessThan(HISTORY_COLUMN_MINS.graph);
  });
});
