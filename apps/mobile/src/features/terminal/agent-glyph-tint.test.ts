// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { glyphSurfaceKey, glyphTint } from "./agent-glyph-tint";

const iconSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "MobileAgentIcon.tsx"),
  "utf8",
);

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
    expect(glyphTint("pi", "pi", true, ON_DARK)).toBe(ON_DARK);
  });

  test("still inverts white line art on a light surface", () => {
    expect(glyphTint("cursor", "cursor", false, LIGHT_LABEL)).toBe(LIGHT_LABEL);
    expect(glyphTint("cline", "cline", false, LIGHT_LABEL)).toBeUndefined();
  });

  test("glyphSurfaceKey changes with color scheme and tint", () => {
    expect(glyphSurfaceKey("light", LIGHT_LABEL)).not.toBe(glyphSurfaceKey("dark", LIGHT_LABEL));
    expect(glyphSurfaceKey("light", LIGHT_LABEL)).not.toBe(glyphSurfaceKey("light", undefined));
    expect(iconSource).toContain(
      'key={glyphSurfaceKey(onDark ? "dark" : theme.colorScheme, tint)}',
    );
  });
});
