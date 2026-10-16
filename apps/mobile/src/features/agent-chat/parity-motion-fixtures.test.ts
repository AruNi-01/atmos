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
    expect(preview).not.toContain("belowCount={0}");

    const marker = fixture.messages.find((message) => message.id === PARITY_TAIL_MARKER_ID);
    expect(marker?.parts).toEqual([{ type: "text", text: "Reply 50" }]);
  });

  test("tail evidence requires a larger below count at the same scroll offset", () => {
    const held = [
      parityTailLine({ below: 0, end: 0, stick: true, step: 0, top: 0 }),
      parityTailLine({ below: 40, end: 2400, stick: false, step: 1, top: 1200 }),
      parityTailLine({ below: 41, end: 2401, stick: false, step: 2, top: 1201 }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(held))).toBe(true);
    expect(parityTailReadingHeld(parityTailSamples("no tail lines"))).toBe(false);

    const jumped = [
      parityTailLine({ below: 40, end: 2400, stick: false, step: 1, top: 1200 }),
      parityTailLine({ below: 41, end: 1800, stick: false, step: 2, top: 1800 }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(jumped))).toBe(false);

    const stuck = [
      parityTailLine({ below: 0, end: 0, stick: true, step: 0, top: 4000 }),
      parityTailLine({ below: 0, end: 0, stick: true, step: 3, top: 4000 }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(stuck))).toBe(false);

    const unstuckAtEnd = [
      parityTailLine({ below: 1, end: 0, stick: false, step: 1, top: 4000 }),
      parityTailLine({ below: 2, end: 0, stick: false, step: 2, top: 4000 }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(unstuckAtEnd))).toBe(false);

    const settling = [
      parityTailLine({ below: 10, end: 800, stick: false, step: 0, top: 100 }),
      parityTailLine({ below: 12, end: 2000, stick: false, step: 1, top: 900 }),
      parityTailLine({ below: 13, end: 2001, stick: false, step: 2, top: 901 }),
    ].join("\n");
    expect(parityTailReadingHeld(parityTailSamples(settling))).toBe(true);
  });
});
