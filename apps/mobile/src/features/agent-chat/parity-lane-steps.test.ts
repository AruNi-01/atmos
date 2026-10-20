// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { parityFixtureById } from "@atmos/agent-transcript";
import { composerCardsFromParity, parityPreviewLane } from "./parity-composer-cards";
import { parityLaneSampleTaps, parityLaneShots } from "./parity-lane-steps";

describe("F12 lane steps", () => {
  test("swaps off the preempted permission, then collapses the second pill", () => {
    const cards = composerCardsFromParity(parityFixtureById("F12")?.cards);
    const initial = parityPreviewLane(cards);
    expect(initial.visible).toBe("permission");
    const taps = parityLaneSampleTaps(cards.available, initial.visible);
    expect(taps).toEqual(["plan", "queue", "queue"]);
    expect(parityLaneShots(initial, taps).map((shot) => [shot.atMs, shot.state.visible])).toEqual([
      [0, "permission"],
      [500, "plan"],
      [1000, "queue"],
      [1500, null],
    ]);
  });
});
