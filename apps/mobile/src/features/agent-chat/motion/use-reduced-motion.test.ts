import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  chatReducedMotion,
  parityReducedMotionActive,
  pushParityReducedMotion,
  resetParityReducedMotion,
} from "./parity-reduced-motion";

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
    const hook = readFileSync(join(import.meta.dir, "use-reduced-motion.ts"), "utf8");
    expect(hook).toContain("parityReducedMotionActive");
    expect(hook).toContain("chatReducedMotion(system, forced)");
  });
});
