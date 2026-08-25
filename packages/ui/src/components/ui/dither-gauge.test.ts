import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "dither-gauge.tsx"), "utf8");

describe("ServerGauge", () => {
  test("uses the wide Amicro semicircle geometry", () => {
    expect(source).toContain("const startAngle = Math.PI");
    expect(source).toContain("const endAngle = Math.PI * 2");
    expect(source).toContain("height * 0.7");
    expect(source).toContain("h-28");
  });

  test("springs live values while respecting reduced motion", () => {
    expect(source).toContain("useSpring");
    expect(source).toContain("stiffness: 120");
    expect(source).toContain("damping: 20");
    expect(source).toContain("reducedMotion ? valueRef.current : valueSpring.get()");
  });

  test("keeps the full track and dithered value fill", () => {
    expect(source).toContain("trackRef.current");
    expect(source).toContain("ctx.clip()");
    expect(source).toContain("smoothstep");
    expect(source).toContain("hash(centerX, centerY)");
  });
});
