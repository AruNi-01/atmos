import { describe, expect, test } from "bun:test";
import {
  hashString,
  matrixOrbColor,
  matrixOrbDotsForSize,
  matrixOrbLayout,
  readMatrixOrbTheme,
} from "./matrix-orb-color";

function parseHsl(color: string): { h: number; s: number; l: number } {
  const match = color.match(/^hsl\(([-\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
  if (!match) throw new Error(`not hsl: ${color}`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function hueDelta(a: number, b: number): number {
  return Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));
}

describe("matrixOrbColor", () => {
  test("is stable for the same seed and theme", () => {
    expect(matrixOrbColor("agent-a", { scheme: "light" })).toBe(
      matrixOrbColor("agent-a", { scheme: "light" }),
    );
  });

  test("gives distinct hues to different seeds", () => {
    const seeds = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const hues = seeds.map((seed) => parseHsl(matrixOrbColor(seed, { scheme: "light" })).h);
    const unique = new Set(hues.map((hue) => hue.toFixed(1)));
    expect(unique.size).toBe(seeds.length);
    let minDelta = 180;
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        minDelta = Math.min(minDelta, hueDelta(hues[i], hues[j]));
      }
    }
    expect(minDelta).toBeGreaterThan(8);
  });

  test("does not use the upstream orange default", () => {
    const color = matrixOrbColor("matrix-orb", { scheme: "light" }).toLowerCase();
    expect(color).not.toBe("#f75001");
    expect(color.startsWith("hsl(")).toBe(true);
  });

  test("dark scheme is lighter than light scheme for the same seed", () => {
    const light = parseHsl(matrixOrbColor("row-1", { scheme: "light", palette: "indigo" }));
    const dark = parseHsl(matrixOrbColor("row-1", { scheme: "dark", palette: "indigo" }));
    expect(dark.l).toBeGreaterThan(light.l);
    expect(hueDelta(light.h, dark.h)).toBeLessThan(0.2);
  });

  test("named palettes shift the same seed toward different accents", () => {
    const indigo = parseHsl(
      matrixOrbColor("shared", { scheme: "light", palette: "indigo" }),
    ).h;
    const crimson = parseHsl(
      matrixOrbColor("shared", { scheme: "light", palette: "crimson" }),
    ).h;
    expect(hueDelta(indigo, crimson)).toBeGreaterThan(20);
  });
});

describe("readMatrixOrbTheme", () => {
  test("reads class and data-palette from the root", () => {
    expect(readMatrixOrbTheme(null, true)).toEqual({ scheme: "dark", palette: null });
    const root = {
      classList: { contains: (name: string) => name === "dark" },
      getAttribute: (name: string) => (name === "data-palette" ? "sage" : null),
    };
    expect(readMatrixOrbTheme(root as unknown as Element)).toEqual({
      scheme: "dark",
      palette: "sage",
    });
  });
});

describe("matrixOrbDotsForSize", () => {
  test("uses a coarser grid at indicator sizes", () => {
    expect(matrixOrbDotsForSize(20)).toBe(5);
    expect(matrixOrbDotsForSize(32)).toBe(7);
    expect(matrixOrbDotsForSize(240)).toBe(11);
    expect(matrixOrbLayout(20).occupancy).toBeGreaterThan(matrixOrbLayout(240).occupancy);
  });
});

describe("hashString", () => {
  test("is deterministic", () => {
    expect(hashString("tool-1")).toBe(hashString("tool-1"));
    expect(hashString("tool-1")).not.toBe(hashString("tool-2"));
  });
});
