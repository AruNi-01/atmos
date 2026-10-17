// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { SCROLL_UNIT_SPRING, textMorphCharacters, textMorphFrame } from "./scroll-pill-unit";

const dir = dirname(fileURLToPath(import.meta.url));

describe("scroll pill unit", () => {
  test("keys characters the way TextMorph does and fades only the extra s", () => {
    expect(textMorphCharacters("message").map((char) => char.id)).toEqual([
      "m1",
      "e1",
      "s1",
      "s2",
      "a1",
      "g1",
      "e2",
    ]);
    const grown = textMorphFrame("messages", "message");
    expect(grown.filter((slot) => slot.phase === "stay")).toHaveLength(7);
    expect(grown.filter((slot) => slot.phase === "enter").map((slot) => slot.id)).toEqual(["s3"]);
    expect(grown.some((slot) => slot.phase === "exit")).toBe(false);
    const shrunk = textMorphFrame("message", "messages");
    expect(shrunk.at(-1)).toEqual({ id: "s3", label: "s", phase: "exit" });
    expect(shrunk.filter((slot) => slot.phase === "enter")).toHaveLength(0);
    expect(textMorphFrame("messages", "messages").every((slot) => slot.phase === "stay")).toBe(
      true,
    );
    expect(textMorphCharacters("a b")[1]).toEqual({ id: " 1", label: "\u00A0" });
  });

  test("uses TextMorph's opacity spring and snaps under reduced motion", () => {
    expect(SCROLL_UNIT_SPRING).toEqual({ damping: 18, mass: 0.3, stiffness: 280 });
    const pill = readFileSync(join(dir, "scroll-pill.tsx"), "utf8");
    expect(pill).toContain("textMorphFrame");
    expect(pill).toContain("withSpring");
    expect(pill).toContain("SCROLL_UNIT_SPRING");
    expect(pill).toContain("if (reduced || !morphing)");
    expect(pill).toContain("agentChatTokenMap.textXs");
    expect(pill).toContain('fontWeight: "500"');
    expect(pill).toContain('fontVariant: ["tabular-nums"]');
    expect(pill).toContain("SCROLL_PILL_HEIGHT");
    expect(pill).toContain("SCROLL_PILL_ICON");
    expect(pill).toContain("chatSecondaryForeground(theme.isDark)");
    expect(pill).not.toContain("theme.colors.label");
    expect(pill).toContain("paddingLeft: showCopy ? 8 : 0");
    expect(pill).toContain("paddingRight: showCopy ? 10 : 0");
    expect(pill).toContain("gap: 6");
    expect(pill).not.toContain("fontSize: 14");
    expect(pill).not.toContain("height: 36");
    expect(pill).not.toContain("paddingHorizontal: 14");
    expect(pill).not.toContain("size={14}");
  });
});
