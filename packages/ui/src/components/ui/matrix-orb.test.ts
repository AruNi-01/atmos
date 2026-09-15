import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "matrix-orb.tsx"), "utf8");

describe("MatrixOrb", () => {
  test("only exposes idle and thinking", () => {
    expect(source).toContain('export type MatrixOrbState = "idle" | "thinking"');
    expect(source).toContain('const STATES: MatrixOrbState[] = ["idle", "thinking"]');
    expect(source).not.toMatch(/["']listening["']/);
    expect(source).not.toContain("#F75001");
    expect(source).not.toContain("#f75001");
  });

  test("picks a theme-aware color from seed unless color is set", () => {
    expect(source).toContain("useMatrixOrbFill");
    expect(source).toContain("matrixOrbColor(seed ?? FALLBACK_SEED, theme)");
    expect(source).toContain('data-slot="matrix-orb"');
    expect(source).toContain("showLabel = false");
  });
});
