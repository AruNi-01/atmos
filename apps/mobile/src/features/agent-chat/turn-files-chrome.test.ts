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
  TURN_FILES_RADIUS,
  turnFilesBorder,
  turnFilesFill,
} from "./turn-files-chrome";

const dir = dirname(fileURLToPath(import.meta.url));

describe("turn file card chrome", () => {
  test("matches web rounded-xl, border, and muted/40", () => {
    expect(TURN_FILES_RADIUS).toBe(14);
    expect(TURN_FILES_FILL_LIGHT).toBe("rgba(222, 222, 224, 0.4)");
    expect(TURN_FILES_FILL_DARK).toBe("rgba(39, 39, 42, 0.4)");
    expect(TURN_FILES_BORDER_LIGHT).toBe("rgba(0, 0, 0, 0.1)");
    expect(TURN_FILES_BORDER_DARK).toBe("rgba(255, 255, 255, 0.1)");
    expect(turnFilesFill(false)).toBe(TURN_FILES_FILL_LIGHT);
    expect(turnFilesFill(true)).toBe(TURN_FILES_FILL_DARK);
    expect(turnFilesBorder(false)).toBe(TURN_FILES_BORDER_LIGHT);
    expect(turnFilesBorder(true)).toBe(TURN_FILES_BORDER_DARK);
    const source = readFileSync(join(dir, "assistant-footer.tsx"), "utf8");
    const card = source.slice(
      source.indexOf("export function AssistantTurnFiles"),
      source.indexOf("const styles"),
    );
    expect(card).toContain("turnFilesFill");
    expect(card).toContain("turnFilesBorder");
    expect(card).toContain("TURN_FILES_RADIUS");
    expect(card).toContain("borderWidth: 1");
    expect(card).toContain("paddingHorizontal: 6");
    expect(card).toContain("size={16}");
    expect(card).not.toContain("cardSubtle");
    expect(card).not.toContain("borderRadius: 16");
  });
});
