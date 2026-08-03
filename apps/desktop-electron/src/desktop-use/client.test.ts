import { describe, expect, it } from "bun:test";
import { resolveAtmosCliPath } from "./client.ts";

describe("desktop-use client", () => {
  it("resolves an atmos CLI path string without vendor names", () => {
    const path = resolveAtmosCliPath();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
    expect(path.toLowerCase()).not.toContain("cua");
    expect(path.toLowerCase()).not.toContain("trycua");
  });
});
