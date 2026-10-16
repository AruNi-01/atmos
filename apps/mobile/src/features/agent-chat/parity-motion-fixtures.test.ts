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
  segmentAssistantParts,
  toolGroupHasRunning,
} from "@atmos/agent-transcript";
import {
  PARITY_MOTION_ROW_MS,
  PARITY_SETTLED_ASSISTANT_ID,
  PARITY_SETTLED_FIXTURE,
  PARITY_STREAM_FIXTURE,
  parityMotionKind,
  paritySettledToolMessages,
  parityStreamToolFrame,
  parityStreamToolMessages,
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
    expect(parityMotionKind("F4")).toBeNull();
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
});
