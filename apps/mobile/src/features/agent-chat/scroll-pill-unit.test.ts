// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { SCROLL_UNIT_SPRING, scrollUnitStack } from "./scroll-pill-unit";

const dir = dirname(fileURLToPath(import.meta.url));

describe("scroll pill unit", () => {
  test("keeps the previous plural so the strings can cross-fade", () => {
    expect(scrollUnitStack("messages", "message")).toEqual({
      current: "messages",
      outgoing: "message",
    });
    expect(scrollUnitStack("message", "messages")).toEqual({
      current: "message",
      outgoing: "messages",
    });
    expect(scrollUnitStack("messages", "messages")).toEqual({
      current: "messages",
      outgoing: null,
    });
  });

  test("uses TextMorph's opacity spring and snaps under reduced motion", () => {
    expect(SCROLL_UNIT_SPRING).toEqual({ damping: 18, mass: 0.3, stiffness: 280 });
    const pill = readFileSync(join(dir, "scroll-pill.tsx"), "utf8");
    expect(pill).toContain("scrollUnitStack");
    expect(pill).toContain("withSpring");
    expect(pill).toContain("SCROLL_UNIT_SPRING");
    expect(pill).toContain("if (reduced || outgoing == null)");
  });
});
