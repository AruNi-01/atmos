// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  TURN_FILES_BORDER_DARK,
  TURN_FILES_BORDER_LIGHT,
  TURN_FILES_FILL_DARK,
  TURN_FILES_FILL_LIGHT,
  TURN_FILES_FADE,
  TURN_FILES_MARGIN_TOP,
  TURN_FILES_MAX_HEIGHT,
  TURN_FILES_RADIUS,
  compositeOver,
  turnFilesBorder,
  turnFilesFadeClear,
  turnFilesFadePx,
  turnFilesFill,
} from "./turn-files-chrome";

const dir = dirname(fileURLToPath(import.meta.url));

describe("turn file card chrome", () => {
  test("matches web rounded-xl, border, and muted/40", () => {
    expect(TURN_FILES_RADIUS).toBe(14);
    expect(TURN_FILES_MARGIN_TOP).toBe(12);
    expect(TURN_FILES_FILL_LIGHT).toBe("rgba(222, 222, 224, 0.4)");
    expect(TURN_FILES_FILL_DARK).toBe("rgba(39, 39, 42, 0.4)");
    expect(TURN_FILES_BORDER_LIGHT).toBe("rgba(0, 0, 0, 0.1)");
    expect(TURN_FILES_BORDER_DARK).toBe("rgba(255, 255, 255, 0.1)");
    expect(turnFilesFill(false)).toBe(TURN_FILES_FILL_LIGHT);
    expect(turnFilesFill(true)).toBe(TURN_FILES_FILL_DARK);
    expect(turnFilesBorder(false)).toBe(TURN_FILES_BORDER_LIGHT);
    expect(turnFilesBorder(true)).toBe(TURN_FILES_BORDER_DARK);
    expect(TURN_FILES_MAX_HEIGHT).toBe(176);
    expect(TURN_FILES_FADE).toBe(24);
    expect(compositeOver(TURN_FILES_FILL_LIGHT, "#f4f4f6")).toBe("rgb(235, 235, 237)");
    expect(compositeOver(TURN_FILES_FILL_DARK, "#000000")).toBe("rgb(16, 16, 17)");
    expect(turnFilesFadePx(0)).toBe(0);
    expect(turnFilesFadePx(8)).toBe(8);
    expect(turnFilesFadePx(40)).toBe(24);
    expect(turnFilesFadeClear("rgb(235, 235, 237)")).toBe("rgba(235, 235, 237, 0)");
    const source = readFileSync(join(dir, "assistant-footer.tsx"), "utf8");
    const card = source.slice(source.indexOf("export function AssistantTurnFiles"));
    expect(card).toContain("collectTurnFileChanges");
    expect(card).toContain("visibleTurnFileChanges");
    expect(card).toContain("filesChangedLabel");
    expect(card).toContain("theme.colors.cardSubtle");
    expect(card).toContain("theme.colors.glassBorder");
    expect(card).toContain("borderRadius: 16");
    expect(card).toContain("marginTop: 12");
  });
});
