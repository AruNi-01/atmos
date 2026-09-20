import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TOOL_CALL_DENSITY,
  normalizeToolCallDensity,
  toolCallDensityFromIndex,
  toolCallDensityIndex,
  toolCallDensityIndexFromRatio,
} from "@/features/agent/lib/tool-call-density";

describe("tool call density", () => {
  it("normalizes unknown values to compact", () => {
    expect(DEFAULT_TOOL_CALL_DENSITY).toBe("compact");
    expect(normalizeToolCallDensity("compact")).toBe("compact");
    expect(normalizeToolCallDensity("standard")).toBe("standard");
    expect(normalizeToolCallDensity("detailed")).toBe("detailed");
    expect(normalizeToolCallDensity("verbose")).toBe(DEFAULT_TOOL_CALL_DENSITY);
    expect(normalizeToolCallDensity(undefined)).toBe("compact");
  });

  it("maps slider indexes onto the three levels", () => {
    expect(toolCallDensityIndex("compact")).toBe(0);
    expect(toolCallDensityIndex("detailed")).toBe(2);
    expect(toolCallDensityFromIndex(0)).toBe("compact");
    expect(toolCallDensityFromIndex(1)).toBe("standard");
    expect(toolCallDensityFromIndex(2)).toBe("detailed");
    expect(toolCallDensityFromIndex(9)).toBe("compact");
  });

  it("snaps a slider ratio onto the nearest density tick", () => {
    expect(toolCallDensityIndexFromRatio(0)).toBe(0);
    expect(toolCallDensityIndexFromRatio(0.2)).toBe(0);
    expect(toolCallDensityIndexFromRatio(0.5)).toBe(1);
    expect(toolCallDensityIndexFromRatio(0.9)).toBe(2);
    expect(toolCallDensityIndexFromRatio(1)).toBe(2);
  });
});
