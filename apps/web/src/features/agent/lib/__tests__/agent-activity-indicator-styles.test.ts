import { describe, expect, test } from "bun:test";
import {
  ALL_INDICATOR_STYLE_OPTIONS,
  DEFAULT_INDICATOR_BY_PLACEMENT,
  INDICATOR_STYLE_GROUPS,
  isAgentActivityIndicatorId,
  isOrbIndicatorId,
  isUnicodeIndicatorId,
  ORB_VARIANT_IDS,
  resolveIndicatorId,
  UNICODE_SPINNER_IDS,
} from "../agent-activity-indicator-styles";

describe("agent-activity-indicator-styles", () => {
  test("includes project unicode spinners and all aicss orb variants", () => {
    expect(UNICODE_SPINNER_IDS).toContain("braille");
    expect(UNICODE_SPINNER_IDS).toContain("helix");
    expect(ORB_VARIANT_IDS).toHaveLength(25);
    expect(ORB_VARIANT_IDS).toContain("S1");
    expect(ORB_VARIANT_IDS).toContain("M5");
  });

  test("catalog is unique and covers every group", () => {
    const ids = ALL_INDICATOR_STYLE_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(INDICATOR_STYLE_GROUPS).toHaveLength(6);
    for (const group of INDICATOR_STYLE_GROUPS) {
      expect(group.options.length).toBeGreaterThan(0);
    }
  });

  test("resolveIndicatorId falls back to placement defaults", () => {
    expect(resolveIndicatorId(undefined, "left_sidebar")).toBe(
      DEFAULT_INDICATOR_BY_PLACEMENT.left_sidebar,
    );
    expect(resolveIndicatorId("not-a-style", "terminal_panel")).toBe(
      DEFAULT_INDICATOR_BY_PLACEMENT.terminal_panel,
    );
    expect(resolveIndicatorId("S4", "footer")).toBe("S4");
    expect(resolveIndicatorId("random", "terminal_panel")).toBe("random");
  });

  test("type guards", () => {
    expect(isAgentActivityIndicatorId("braille")).toBe(true);
    expect(isAgentActivityIndicatorId("B2")).toBe(true);
    expect(isAgentActivityIndicatorId("nope")).toBe(false);
    expect(isOrbIndicatorId("G1")).toBe(true);
    expect(isOrbIndicatorId("braille")).toBe(false);
    expect(isUnicodeIndicatorId("random")).toBe(true);
    expect(isUnicodeIndicatorId("orbit")).toBe(true);
    expect(isUnicodeIndicatorId("S1")).toBe(false);
  });
});
