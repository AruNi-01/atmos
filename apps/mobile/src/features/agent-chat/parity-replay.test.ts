// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { parityFixtureById } from "@atmos/agent-transcript";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldParityReplay, parityReplaySeed, parityReplayShotTimes } from "./parity-replay";

function toolStatus(parts: readonly AgentPart[], id: string): string | null {
  for (const part of parts) {
    if (part.type === "tool_call" && part.tool_call_id === id) return part.status;
  }
  return null;
}

describe("F4 script replay", () => {
  const fixture = parityFixtureById("F4");
  const script = fixture?.script ?? [];
  const seed = parityReplaySeed(fixture?.messages ?? []);
  const chatId = script[0]?.event.chat_id ?? "";

  test("samples the tree draw between tool start and the next event", () => {
    expect(script.length).toBeGreaterThan(0);
    expect(parityReplayShotTimes(script)).toEqual([
      0, 200, 400, 600, 800, 900, 1100, 1300, 1400, 1600, 1800, 15000,
    ]);
  });

  test("grows the settled user row through the script instead of showing the finished turn", () => {
    expect(seed.map((message) => message.id)).toEqual(["f4-u"]);
    const before = foldParityReplay(chatId, seed, script, -1);
    expect(before.map((message) => message.role)).toEqual(["user"]);

    const thinking = foldParityReplay(chatId, seed, script, 0);
    expect(thinking[1]?.streaming).toBe(true);
    expect(thinking[1]?.parts.some((part) => part.type === "thinking")).toBe(true);
    expect(toolStatus(thinking[1]?.parts ?? [], "f4-read")).toBeNull();

    const started = foldParityReplay(chatId, seed, script, 200);
    expect(toolStatus(started[1]?.parts ?? [], "f4-read")).toBe("running");

    const readDone = foldParityReplay(chatId, seed, script, 800);
    expect(toolStatus(readDone[1]?.parts ?? [], "f4-read")).toBe("completed");
    expect(toolStatus(readDone[1]?.parts ?? [], "f4-search")).toBeNull();

    const settled = foldParityReplay(chatId, seed, script, 15000);
    expect(settled[1]?.streaming).toBe(false);
    expect(settled[1]?.worked_ms).toBe(15000);
    expect(toolStatus(settled[1]?.parts ?? [], "f4-search")).toBe("completed");
  });
});
