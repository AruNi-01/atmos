// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import {
  CARD_PILL_ORDER,
  INITIAL_LANE,
  orderedCardIds,
  pillShowsAttention,
  reduceLane,
  syncLane,
  type CardId,
  type LaneState,
} from "./card-lane";

function step(state: LaneState, previous: readonly CardId[] | null, next: readonly CardId[]) {
  return syncLane(state, previous, next);
}

describe("reduceLane", () => {
  test("pill order is fixed and the reducer has no scroll field", () => {
    expect(CARD_PILL_ORDER).toEqual([
      "permission",
      "session_op",
      "plan",
      "queue",
      "background",
      "subagents",
      "goal",
      "workflow",
      "context",
    ]);
    expect(orderedCardIds(["context", "queue", "plan", "permission"])).toEqual([
      "permission",
      "plan",
      "queue",
      "context",
    ]);
    expect(Object.keys(INITIAL_LANE).sort()).toEqual(["userChoice", "visible"]);
  });

  test("first load stays collapsed, including a permission that is already available", () => {
    const seeded = syncLane(INITIAL_LANE, null, ["permission", "queue"]);
    expect(seeded.state).toEqual({ visible: null, userChoice: null });
    const again = syncLane(seeded.state, seeded.previous, ["permission", "queue"]);
    expect(again.state.visible).toBeNull();
  });

  test("S17 restores the tapped queue card after permission preempts and leaves", () => {
    let state = INITIAL_LANE;
    let previous: readonly CardId[] | null = null;
    ({ state, previous } = step(state, previous, ["queue"]));
    expect(state).toEqual({ visible: null, userChoice: null });

    state = reduceLane(state, { type: "pill_tapped", id: "queue" });
    expect(state).toEqual({ visible: "queue", userChoice: "queue" });

    ({ state, previous } = step(state, previous, ["permission", "queue"]));
    expect(state).toEqual({ visible: "permission", userChoice: "queue" });

    ({ state, previous } = step(state, previous, ["queue"]));
    expect(state).toEqual({ visible: "queue", userChoice: "queue" });

    state = reduceLane(state, { type: "pill_tapped", id: "queue" });
    expect(state).toEqual({ visible: null, userChoice: null });
    expect(previous).toEqual(["queue"]);
  });

  test("a non-preempting arrival does not steal the slot", () => {
    const next = syncLane(
      { visible: "queue", userChoice: "queue" },
      ["queue"],
      ["queue", "background"],
    );
    expect(next.state).toEqual({ visible: "queue", userChoice: "queue" });
  });

  test("session_op preempts without changing userChoice", () => {
    const next = syncLane(
      { visible: "plan", userChoice: "plan" },
      ["plan"],
      ["session_op", "plan"],
    );
    expect(next.state).toEqual({ visible: "session_op", userChoice: "plan" });
  });

  test("collapsing an auto-preempted card keeps userChoice", () => {
    const state = reduceLane(
      { visible: "permission", userChoice: "queue" },
      { type: "pill_tapped", id: "permission" },
    );
    expect(state).toEqual({ visible: null, userChoice: "queue" });
  });

  test("a card that is not visible can leave without changing visible", () => {
    const next = syncLane({ visible: "queue", userChoice: "queue" }, ["plan", "queue"], ["queue"]);
    expect(next.state).toEqual({ visible: "queue", userChoice: "queue" });
  });

  test("when the visible card leaves, userChoice is restored only if it is still available", () => {
    const restored = syncLane(
      { visible: "permission", userChoice: "queue" },
      ["permission", "queue"],
      ["queue"],
    );
    expect(restored.state).toEqual({ visible: "queue", userChoice: "queue" });

    const cleared = syncLane({ visible: "plan", userChoice: "plan" }, ["plan"], []);
    expect(cleared.state).toEqual({ visible: null, userChoice: "plan" });
  });

  test("visible is always null or a member of available", () => {
    let state: LaneState = { visible: "background", userChoice: "background" };
    state = syncLane(state, ["background", "queue"], ["queue"]).state;
    expect(state.visible === null || state.visible === "queue").toBe(true);
  });

  test("dismissing the visible card collapses it and keeps a different userChoice", () => {
    expect(
      reduceLane(
        { visible: "permission", userChoice: "queue" },
        { type: "card_dismissed", id: "permission" },
      ),
    ).toEqual({ visible: null, userChoice: "queue" });
    const kept = { visible: "queue" as const, userChoice: "queue" as const };
    expect(reduceLane(kept, { type: "card_dismissed", id: "plan" })).toBe(kept);
  });

  test("a collapsed permission or session_op pill shows an attention dot", () => {
    expect(pillShowsAttention("permission", null)).toBe(true);
    expect(pillShowsAttention("session_op", "queue")).toBe(true);
    expect(pillShowsAttention("permission", "permission")).toBe(false);
    expect(pillShowsAttention("queue", null)).toBe(false);
  });
});
