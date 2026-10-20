// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { beforeEach, describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  chatReducedMotion,
  parityReducedMotionActive,
  pushParityReducedMotion,
  resetParityReducedMotion,
} from "./parity-reduced-motion";

const here = dirname(fileURLToPath(import.meta.url));

describe("parity reduced motion", () => {
  beforeEach(() => {
    resetParityReducedMotion();
  });

  test("the system setting applies until a preview pin asks for reduced motion", () => {
    expect(chatReducedMotion(false, false)).toBe(false);
    expect(chatReducedMotion(true, false)).toBe(true);
    expect(chatReducedMotion(false, true)).toBe(true);
    expect(parityReducedMotionActive()).toBe(false);
  });

  test("overlapping preview mounts keep the override until the last one releases", () => {
    const releaseFirst = pushParityReducedMotion();
    const releaseSecond = pushParityReducedMotion();
    expect(parityReducedMotionActive()).toBe(true);
    releaseFirst();
    expect(parityReducedMotionActive()).toBe(true);
    releaseFirst();
    expect(parityReducedMotionActive()).toBe(true);
    releaseSecond();
    expect(parityReducedMotionActive()).toBe(false);
  });

  test("chat motion uses the parity pin ahead of the system setting", () => {
    const hook = readFileSync(join(here, "use-reduced-motion.ts"), "utf8");
    expect(hook).toContain("parityReducedMotionActive");
    expect(hook).toContain("chatReducedMotion(system, forced)");
  });
});
