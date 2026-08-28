import { describe, expect, it } from "bun:test";
import {
  formatWorkDuration,
  formatWorkedAt,
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

describe("formatWorkedAt", () => {
  it("includes the calendar date and time", () => {
    const value = "2026-08-29T12:00:00.000Z";
    expect(formatWorkedAt(value, "zh")).toMatch(/2026/);
    expect(formatWorkedAt(value, "en")).toMatch(/2026/);
    expect(formatWorkedAt("not-a-date", "en")).toBeNull();
  });
});
