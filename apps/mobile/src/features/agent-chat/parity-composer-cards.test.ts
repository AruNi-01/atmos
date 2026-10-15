// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { parityFixtureById } from "@atmos/agent-transcript";
import { orderedCardIds } from "./card-lane";
import { composerCardsFromParity, parityPreviewLane } from "./parity-composer-cards";

describe("composer cards from parity fixtures", () => {
  test("F12 exposes every card and preempts to permission", () => {
    const cards = composerCardsFromParity(parityFixtureById("F12")?.cards);
    expect(orderedCardIds(cards.available)).toEqual([
      "permission",
      "plan",
      "queue",
      "background",
      "subagents",
      "goal",
      "workflow",
      "context",
    ]);
    expect(parityPreviewLane(cards).visible).toBe("permission");
    expect(cards.planText).toBe("Write the notes");
    expect(cards.queue.map((item) => item.prompt)).toEqual([
      "Check src/main.ts",
      "Update the notes",
      "Run the tests",
    ]);
    expect(cards.background[0]?.command).toBe("bun test src");
    expect(cards.subagents[0]?.title).toBe("Inspect src/main.ts");
    expect(cards.goal?.objective).toBe("Ship the notes");
    expect(cards.workflow?.objective).toBe("Research the API");
    expect(cards.context).toMatchObject({ used: 2400, context_window: 16000 });
    expect(cards.permission?.description).toBe("Edit src/lib.ts");
    expect(cards.permission?.questions?.[0]?.prompt).toBe("Allow the edit?");
  });

  test("F11 expands the pending permission and has no other pills", () => {
    const cards = composerCardsFromParity(parityFixtureById("F11")?.cards);
    expect(cards.available).toEqual(["permission"]);
    expect(parityPreviewLane(cards).visible).toBe("permission");
    expect(cards.permission?.description).toBe("Edit src/main.ts");
  });

  test("a transcript-only fixture leaves the lane empty", () => {
    const cards = composerCardsFromParity(parityFixtureById("F3")?.cards);
    expect(cards.available).toEqual([]);
    expect(parityPreviewLane(cards).visible).toBeNull();
  });
});
