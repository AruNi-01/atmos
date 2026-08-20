import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("global loading screen", () => {
  test("startup overlay is a theme-background mark with a breathe, no wordmark", () => {
    const source = readFileSync(
      join(import.meta.dir, "../HostedLandingLoading.tsx"),
      "utf8",
    );
    expect(source).toContain("LogoSvg");
    expect(source).toContain("atmos-logo-breathe");
    expect(source).toContain("bg-background");
    expect(source).not.toContain("AtmosWordmark");
    expect(source).not.toContain("HostedSloganShimmer");
    expect(source).not.toContain("Connecting");
    expect(source).not.toContain("motion");
  });

  test("Next.js loading.tsx reuses the same screen", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../app/loading.tsx"),
      "utf8",
    );
    expect(source).toContain("HostedLandingLoading");
    expect(source).not.toContain("TextShimmer");
    expect(source).not.toContain("animate-spin");
  });
});
