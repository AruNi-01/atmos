import { describe, expect, test } from "bun:test";
import { canonicalColor, displayColor } from "./theme-palette";

describe("theme palette", () => {
  test("light theme keeps canonical colors", () => {
    expect(displayColor("#ffffff", "light")).toBe("#ffffff");
    expect(displayColor("#18181b", "light")).toBe("#18181b");
    expect(canonicalColor("#2e2e33", "light")).toBe("#2e2e33");
  });

  test("dark theme remaps card and label colors without touching accents", () => {
    expect(displayColor("#ffffff", "dark")).toBe("#2e2e33");
    expect(displayColor("#18181b", "dark")).toBe("#f4f4f5");
    expect(displayColor("#fafafa", "dark")).toBe("#18181b");
    expect(displayColor("#3b82f6", "dark")).toBe("#3b82f6");
    expect(displayColor("#ef4444", "dark")).toBe("#ef4444");
    expect(displayColor("transparent", "dark")).toBe("transparent");
  });

  test("dark display colors unmap back to the light IR palette", () => {
    expect(canonicalColor("#2e2e33", "dark")).toBe("#ffffff");
    expect(canonicalColor("#f4f4f5", "dark")).toBe("#18181b");
    expect(canonicalColor("#18181b", "dark")).toBe("#fafafa");
  });
});
