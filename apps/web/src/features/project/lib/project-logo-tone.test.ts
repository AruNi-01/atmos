// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  classifyProjectLogoPixels,
  clearProjectLogoToneCache,
  getCachedProjectLogoTone,
  setCachedProjectLogoTone,
} from "./project-logo-tone";

function pixels(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return data;
}

function disc(
  width: number,
  height: number,
  radius: number,
  rgba: [number, number, number, number],
): Uint8ClampedArray {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  return pixels(width, height, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= radius * radius) {
      return rgba;
    }
    return [0, 0, 0, 0];
  });
}

describe("classifyProjectLogoPixels", () => {
  it("inverts a white transparent mark in light theme", () => {
    expect(classifyProjectLogoPixels(disc(32, 32, 8, [255, 255, 255, 255]), 32, 32)).toBe(
      "invert-light",
    );
  });

  it("inverts a black transparent mark in dark theme", () => {
    expect(classifyProjectLogoPixels(disc(32, 32, 8, [12, 12, 12, 255]), 32, 32)).toBe(
      "invert-dark",
    );
  });

  it("leaves colorful marks unchanged", () => {
    expect(classifyProjectLogoPixels(disc(32, 32, 8, [220, 40, 40, 255]), 32, 32)).toBe(
      "unchanged",
    );
  });

  it("inverts an opaque light plate", () => {
    const data = pixels(16, 16, () => [248, 248, 248, 255]);
    expect(classifyProjectLogoPixels(data, 16, 16)).toBe("invert-light");
  });

  it("inverts an opaque dark plate", () => {
    const data = pixels(16, 16, () => [18, 18, 18, 255]);
    expect(classifyProjectLogoPixels(data, 16, 16)).toBe("invert-dark");
  });

  it("leaves a self-contrasting app icon unchanged", () => {
    const data = pixels(32, 32, (x, y) => {
      const cx = (32 - 1) / 2;
      const cy = (32 - 1) / 2;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= 36) {
        return [255, 255, 255, 255];
      }
      return [8, 8, 8, 255];
    });
    expect(classifyProjectLogoPixels(data, 32, 32)).toBe("unchanged");
  });

  it("leaves empty images unchanged", () => {
    const data = pixels(16, 16, () => [0, 0, 0, 0]);
    expect(classifyProjectLogoPixels(data, 16, 16)).toBe("unchanged");
  });

  it("leaves a mid-gray transparent mark unchanged", () => {
    expect(classifyProjectLogoPixels(disc(32, 32, 8, [140, 140, 140, 255]), 32, 32)).toBe(
      "unchanged",
    );
  });
});

describe("project logo tone cache", () => {
  it("stores and clears tones by src", () => {
    clearProjectLogoToneCache();
    expect(getCachedProjectLogoTone("logo://atmos")).toBeUndefined();
    setCachedProjectLogoTone("logo://atmos", "invert-light");
    expect(getCachedProjectLogoTone("logo://atmos")).toBe("invert-light");
    clearProjectLogoToneCache();
    expect(getCachedProjectLogoTone("logo://atmos")).toBeUndefined();
  });
});
