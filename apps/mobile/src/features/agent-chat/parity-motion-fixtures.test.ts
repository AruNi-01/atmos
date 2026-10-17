// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  hasCollapsibleAssistantProcess,
  parityFixtureById,
  segmentAssistantParts,
  toolGroupHasRunning,
} from "@atmos/agent-transcript";
import {
  PARITY_MOTION_ROW_MS,
  PARITY_SETTLED_ASSISTANT_ID,
  PARITY_SETTLED_FIXTURE,
  PARITY_STREAM_FIXTURE,
  PARITY_TAIL_FIXTURE,
  PARITY_TAIL_MARKER_ID,
  parityMotionKind,
  paritySettledToolMessages,
  parityStreamToolFrame,
  parityStreamToolMessages,
  parityTailLine,
  parityTailMessages,
  parityTailReadingHeld,
  parityTailReturnPhase,
  parityTailSamples,
} from "./parity-motion-fixtures";

const here = dirname(fileURLToPath(import.meta.url));

function assistantParts(step: number) {
  const assistant = parityStreamToolMessages(step).find((message) => message.role === "assistant");
  if (!assistant) throw new Error("missing assistant");
  return assistant;
}

describe("parity motion fixtures", () => {
  test("appends one tool row every 600ms, then remounts the open group", () => {
    expect(PARITY_MOTION_ROW_MS).toBe(600);
    expect(parityStreamToolFrame(0)).toEqual({ cycle: 0, count: 2 });
    expect(parityStreamToolFrame(1)).toEqual({ cycle: 0, count: 3 });
    expect(parityStreamToolFrame(6)).toEqual({ cycle: 0, count: 8 });
    expect(parityStreamToolFrame(7)).toEqual({ cycle: 0, count: 8 });
    expect(parityStreamToolFrame(8)).toEqual({ cycle: 1, count: 2 });

    const first = assistantParts(0);
    const next = assistantParts(1);
    expect(first.streaming).toBe(true);
    expect(first.parts).toHaveLength(2);
    expect(next.parts).toHaveLength(3);
    expect(first.parts[0]).toMatchObject({ type: "tool_call", tool_call_id: "0-read-main" });
    expect(next.parts[0]).toMatchObject({ tool_call_id: "0-read-main" });
    expect(next.parts[2]).toMatchObject({ tool_call_id: "0-read-lib", status: "running" });
    expect(next.parts[1]).toMatchObject({ status: "completed" });
    expect(toolGroupHasRunning(first.parts)).toBe(true);
    expect(hasCollapsibleAssistantProcess(first)).toBe(false);
    expect(
      segmentAssistantParts(first.parts).some((segment) => segment.type === "tool_group"),
    ).toBe(true);

    const restarted = assistantParts(8);
    expect(restarted.parts[0]).toMatchObject({ tool_call_id: "1-read-main" });
    expect(restarted.parts).toHaveLength(2);
  });

  test("the settled contrast is a finished group, and F4 stays the collapsed process", () => {
    expect(parityMotionKind(PARITY_STREAM_FIXTURE)).toBe("stream");
    expect(parityMotionKind(PARITY_SETTLED_FIXTURE)).toBe("settled");
    expect(parityMotionKind(PARITY_TAIL_FIXTURE)).toBe("tail");
    expect(parityMotionKind("F4")).toBeNull();
    expect(parityMotionKind("F13")).toBeNull();
    const assistant = paritySettledToolMessages().find((message) => message.role === "assistant");
    expect(assistant?.id).toBe(PARITY_SETTLED_ASSISTANT_ID);
    expect(assistant?.streaming).toBe(false);
    expect(assistant?.completed_at).toBeTruthy();
    expect(toolGroupHasRunning(assistant?.parts ?? [])).toBe(false);
    expect(hasCollapsibleAssistantProcess(assistant!)).toBe(true);
    expect(assistant?.parts).toHaveLength(5);

    const preview = readFileSync(join(here, "preview-chat-screen.tsx"), "utf8");
    expect(preview).toContain("PARITY_MOTION_ROW_MS");
    expect(preview).toContain("setInterval");
    expect(preview).toContain("agentChatProcessExpandKey(PARITY_SETTLED_ASSISTANT_ID)");
  });

  test("the F13 tail appends rows and the preview pill uses the measured below count", () => {
    const fixture = parityFixtureById("F13");
    if (!fixture) throw new Error("missing F13");
    const baseLength = fixture.messages.length;
    const baseLastId = fixture.messages[baseLength - 1]?.id;
    expect(parityTailMessages(0)).toHaveLength(baseLength);
    expect(parityTailMessages(0)[0]?.id).toBe(fixture.messages[0]?.id);

    const grown = parityTailMessages(3);
    expect(grown).toHaveLength(baseLength + 3);
    expect(grown[baseLength]).toMatchObject({
      id: "f13-tail-1",
      role: "assistant",
      streaming: false,
    });
    expect(grown[baseLength + 1]).toMatchObject({ id: "f13-tail-2", streaming: false });
    expect(grown[baseLength + 2]).toMatchObject({
      id: "f13-tail-3",
      streaming: true,
      parts: [{ type: "text", text: "Tail 3" }],
    });
    expect(fixture.messages).toHaveLength(baseLength);
    expect(fixture.messages[baseLength - 1]?.id).toBe(baseLastId);
    expect(grown[baseLength - 1]?.id).toBe(baseLastId);

    const preview = readFileSync(join(here, "preview-chat-screen.tsx"), "utf8");
    expect(preview).toContain("parityTailMessages");
    expect(preview).toContain('motion === "tail" ? parityTailMessages(tailStep)');
    expect(preview).toContain("onStickChange={liveTail ? onStickChange : undefined}");
    expect(preview).toContain("belowCount={liveTail ? stick.belowCount : 0}");
    expect(preview).toContain("stickToEnd={liveTail ? stick.stickToEnd : true}");
    expect(preview).toContain("scrollToEndAnimated");
    expect(preview).toContain("PARITY_TAIL_MARKER_ID");
    expect(preview).toContain("revealMessage");
    expect(preview).toContain('scrollParam === "away" || pinned?.scroll === "away"');
    expect(preview).toContain("parityTailLine");
    expect(preview).toContain("useIsFocused");
    expect(preview).toContain("useSyncExternalStore");
    expect(preview).toContain("takeParityOwner");
    expect(preview).toContain("bindParityTailMount");
    expect(preview).toContain("releaseParityOwner");
    expect(preview).toContain("if (!scrollAway || !ownsTail) return");
    expect(preview).toContain("if (!liveTail || !ownsTail) return");
    expect(preview).toContain("parityOwnerIs");
    expect(preview).toContain("parityTailOwned");
    expect(preview).toContain("pushParityReducedMotion");
    expect(preview).toContain('frame.motion !== "reduced"');
    expect(preview).toContain('frame.replay === "script"');
    expect(preview).toContain("foldParityReplay");
    expect(preview).toContain("[parity] replay done ${pass}");
    expect(preview).toContain('frame.motion === "reduced" ? "reduced" : "live"');
    expect(preview).toContain('frame.lane === "steps"');
    expect(preview).toContain("parityLaneShots");
    expect(preview).toContain("[parity] lane done");
    expect(preview).toContain('frame.pill === "return"');
    expect(preview).toContain("parityTailReturnPhase");
    expect(preview).toContain("[parity] tail returned");
    expect(preview).not.toContain("belowCount={0}");

    const marker = fixture.messages.find((message) => message.id === PARITY_TAIL_MARKER_ID);
    expect(marker?.parts).toEqual([{ type: "text", text: "Reply 50" }]);
  });

  test("tail evidence requires Reply 50 to stay in view while the below count grows", () => {
    const held = [
      parityTailLine({ below: 0, end: 0, marker: -1, stick: true, step: 0, top: 0, view: 0 }),
      parityTailLine({
        below: 40,
        end: 2400,
        marker: 1210,
        stick: false,
        step: 1,
        top: 1200,
        view: 800,
      }),
      parityTailLine({
        below: 41,
        end: 2401,
        marker: 1211,
        stick: false,
        step: 2,
        top: 1201,
        view: 800,
      }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(held))).toBe(true);
    const heldSamples = parityTailSamples(held);
    expect(parityTailReturnPhase(heldSamples, false)).toBe("press");
    expect(parityTailReturnPhase(heldSamples, true)).toBe("wait");
    const landed = parityTailSamples(
      `${held}\n[parity] tail returned below=2 stick=1 end=0 top=9000\n${parityTailLine({
        below: 2,
        end: 0,
        marker: 9000,
        stick: true,
        step: 3,
        top: 9000,
        view: 800,
      })}`,
    );
    expect(landed).toHaveLength(heldSamples.length + 1);
    expect(parityTailReturnPhase(landed, true)).toBe("landed");
    expect(parityTailReadingHeld(parityTailSamples("no tail lines"))).toBe(false);

    const jumped = [
      parityTailLine({
        below: 40,
        end: 2400,
        marker: 1210,
        stick: false,
        step: 1,
        top: 1200,
        view: 800,
      }),
      parityTailLine({
        below: 41,
        end: 1800,
        marker: 1810,
        stick: false,
        step: 2,
        top: 1800,
        view: 800,
      }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(jumped))).toBe(false);

    const stuck = [
      parityTailLine({ below: 0, end: 0, marker: 100, stick: true, step: 0, top: 4000, view: 800 }),
      parityTailLine({ below: 0, end: 0, marker: 100, stick: true, step: 3, top: 4000, view: 800 }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(stuck))).toBe(false);

    const unstuckAtEnd = [
      parityTailLine({
        below: 1,
        end: 0,
        marker: 100,
        stick: false,
        step: 1,
        top: 4000,
        view: 800,
      }),
      parityTailLine({
        below: 2,
        end: 0,
        marker: 100,
        stick: false,
        step: 2,
        top: 4000,
        view: 800,
      }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(unstuckAtEnd))).toBe(false);

    const markerOffscreen = [
      parityTailLine({
        below: 185,
        end: 8000,
        marker: -1,
        stick: false,
        step: 0,
        top: 0,
        view: 800,
      }),
      parityTailLine({
        below: 186,
        end: 8040,
        marker: -1,
        stick: false,
        step: 1,
        top: 0,
        view: 800,
      }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(markerOffscreen))).toBe(false);

    const settling = [
      parityTailLine({
        below: 10,
        end: 800,
        marker: 100,
        stick: false,
        step: 0,
        top: 100,
        view: 800,
      }),
      parityTailLine({
        below: 12,
        end: 2000,
        marker: 910,
        stick: false,
        step: 1,
        top: 900,
        view: 800,
      }),
      parityTailLine({
        below: 13,
        end: 2001,
        marker: 911,
        stick: false,
        step: 2,
        top: 901,
        view: 800,
      }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(settling))).toBe(true);
  });
});
