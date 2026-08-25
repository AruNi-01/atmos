import { describe, expect, test } from "bun:test";
import {
  resourceMonitorDitherColor,
  resourceMonitorDitherTheme,
  resourceMonitorPressureTone,
} from "@/features/resource-monitor/lib/resource-monitor-pressure";

describe("resourceMonitorPressureTone", () => {
  test("maps <60 low, 60–79 medium, ≥80 high", () => {
    expect(resourceMonitorPressureTone(0)).toBe("low");
    expect(resourceMonitorPressureTone(59.999)).toBe("low");
    expect(resourceMonitorPressureTone(60)).toBe("medium");
    expect(resourceMonitorPressureTone(79.999)).toBe("medium");
    expect(resourceMonitorPressureTone(80)).toBe("high");
    expect(resourceMonitorPressureTone(100)).toBe("high");
  });
});

describe("resourceMonitorDitherColor", () => {
  test("uses success/warning/destructive hex by theme for pressure", () => {
    expect(resourceMonitorDitherColor("light", "pressure", 12)).toBe("#0AA543");
    expect(resourceMonitorDitherColor("light", "pressure", 60)).toBe("#D99600");
    expect(resourceMonitorDitherColor("light", "pressure", 80)).toBe("#E7000B");
    expect(resourceMonitorDitherColor("dark", "pressure", 0)).toBe("#5FCC74");
    expect(resourceMonitorDitherColor("dark", "pressure", 79)).toBe("#EEB245");
    expect(resourceMonitorDitherColor("dark", "pressure", 99)).toBe("#FF6467");
  });

  test("keeps available/cached/free neutral even at 80%+", () => {
    expect(resourceMonitorDitherColor("light", "neutral", 80)).toBe("#71717B");
    expect(resourceMonitorDitherColor("dark", "neutral", 100)).toBe("#9F9FA9");
    expect(resourceMonitorDitherColor("light", "neutral", 80)).not.toBe(
      resourceMonitorDitherColor("light", "pressure", 80),
    );
  });

  test("treats unresolved theme as dark", () => {
    expect(resourceMonitorDitherTheme(undefined)).toBe("dark");
    expect(resourceMonitorDitherTheme("system")).toBe("dark");
    expect(resourceMonitorDitherTheme("light")).toBe("light");
  });
});
