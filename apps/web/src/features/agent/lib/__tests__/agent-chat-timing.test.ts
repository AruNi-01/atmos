import { describe, expect, it } from "bun:test";
import {
  clockFromElapsedMs,
  formatUserMessageTime,
  formatWorkDuration,
  formatWorkedAt,
  snapshotLiveElapsedMs,
  thinkingBlockDurationMs,
  thinkingDurationSeconds,
} from "@/features/agent/lib/agent-chat-timing";

describe("formatWorkDuration", () => {
  it("formats seconds, minutes, and hours", () => {
    expect(formatWorkDuration(0)).toBe("0s");
    expect(formatWorkDuration(14_000)).toBe("14s");
    expect(formatWorkDuration(15 * 60_000 + 23_000)).toBe("15m23s");
    expect(formatWorkDuration(3600_000 + 20 * 60_000 + 32_000)).toBe("1h20m32s");
  });
});

describe("snapshotLiveElapsedMs", () => {
  it("uses the server worked_ms on a streaming assistant as the source of truth", () => {
    expect(
      snapshotLiveElapsedMs({
        running_turn_started_at: "2026-08-30T00:00:00.000Z",
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [{ type: "text", text: "hi" }],
            streaming: true,
            worked_ms: 14_000,
            thinking_ms: 4_000,
          },
        ],
      }, Date.parse("2026-08-30T00:00:30.000Z")),
    ).toBe(14_000);
  });

  it("falls back to running_turn_started_at when worked_ms is missing", () => {
    const now = Date.parse("2026-08-30T00:00:20.000Z");
    expect(
      snapshotLiveElapsedMs({
        running_turn_started_at: "2026-08-30T00:00:00.000Z",
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [{ type: "thinking", text: "hmm" }],
            streaming: true,
          },
        ],
      }, now),
    ).toBe(20_000);
  });

  it("returns null for a settled history snapshot", () => {
    expect(
      snapshotLiveElapsedMs({
        running_turn_started_at: null,
        messages: [
          {
            id: "a1",
            role: "assistant",
            parts: [{ type: "text", text: "done" }],
            streaming: false,
            worked_ms: 14_000,
          },
        ],
      }),
    ).toBeNull();
  });

  it("builds a local clock that continues from the server elapsed", () => {
    const now = 1_000_000;
    expect(clockFromElapsedMs(14_000, now)).toBe(now - 14_000);
  });
});

describe("thinkingDurationSeconds", () => {
  it("returns whole seconds for restored thinking duration", () => {
    expect(thinkingDurationSeconds(undefined)).toBeUndefined();
    expect(thinkingDurationSeconds(null)).toBeUndefined();
    expect(thinkingDurationSeconds(0)).toBeUndefined();
    expect(thinkingDurationSeconds(400)).toBe(1);
    expect(thinkingDurationSeconds(4_000)).toBe(4);
    expect(thinkingDurationSeconds(4_100)).toBe(5);
  });
});

describe("thinkingBlockDurationMs", () => {
  it("uses the part duration instead of the turn total", () => {
    const first = { type: "thinking", duration_ms: 5_000 };
    const second = { type: "thinking", duration_ms: 8_000 };
    const parts = [first, { type: "tool_call" }, second];
    expect(thinkingBlockDurationMs(first, parts, 45_000)).toBe(5_000);
    expect(thinkingBlockDurationMs(second, parts, 45_000)).toBe(8_000);
  });

  it("falls back to the turn total only for a single thinking part", () => {
    const only = { type: "thinking" };
    expect(thinkingBlockDurationMs(only, [only], 4_000)).toBe(4_000);
    const first = { type: "thinking" };
    const second = { type: "thinking" };
    expect(thinkingBlockDurationMs(first, [first, second], 45_000)).toBeUndefined();
  });
});

describe("formatWorkedAt", () => {
  it("includes the calendar date and time", () => {
    const value = "2026-08-29T12:00:00.000Z";
    expect(formatWorkedAt(value, "zh")).toMatch(/2026/);
    expect(formatWorkedAt(value, "en")).toMatch(/2026/);
    expect(formatWorkedAt("not-a-date", "en")).toBeNull();
  });
});

describe("formatUserMessageTime", () => {
  it("formats a compact month-day time without the year", () => {
    const value = "2026-07-29T13:23:00.000Z";
    expect(formatUserMessageTime(value, "en")).toMatch(/29/);
    expect(formatUserMessageTime(value, "en")).not.toMatch(/2026/);
    expect(formatUserMessageTime(value, "zh")).toMatch(/29/);
    expect(formatUserMessageTime("not-a-date", "en")).toBeNull();
    expect(formatUserMessageTime("1970-01-01T00:00:00.000Z", "en")).toBeNull();
  });
});
