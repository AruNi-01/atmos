// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { glyphTint } from "./agent-glyph-tint";

const LIGHT_LABEL = "#111112";
const ON_DARK = "#ffffff";

describe("glyphTint", () => {
  test("keeps white line art visible on a dark popover", () => {
    expect(glyphTint("cursor", "cursor", true, ON_DARK)).toBeUndefined();
    expect(glyphTint("claude", "claude-code", true, ON_DARK)).toBeUndefined();
  });

  test("paints black line art white on a dark popover", () => {
    expect(glyphTint("cline", "cline", true, ON_DARK)).toBe(ON_DARK);
    expect(glyphTint("grok", "grok-build", true, ON_DARK)).toBe(ON_DARK);
  });

  test("still inverts white line art on a light surface", () => {
    expect(glyphTint("cursor", "cursor", false, LIGHT_LABEL)).toBe(LIGHT_LABEL);
    expect(glyphTint("cline", "cline", false, LIGHT_LABEL)).toBeUndefined();
  });
});
