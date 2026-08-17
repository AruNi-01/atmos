// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Token Usage cookie consent prompt", () => {
  const pageSource = readFileSync(
    join(import.meta.dirname, "../TokenUsagePage.tsx"),
    "utf8",
  );
  const bannerSource = readFileSync(
    join(import.meta.dirname, "../TokenUsageCookieConsentBanner.tsx"),
    "utf8",
  );

  it("floats a small rounded card at the bottom-right instead of a page-width banner", () => {
    expect(pageSource).toContain("TokenUsageCookieConsentBanner");
    expect(pageSource).toContain("absolute right-4 bottom-4");
    expect(pageSource).toContain("data-token-usage-share-exclude");
    expect(pageSource).toContain("tryCookies: granted");
    expect(bannerSource).toContain("w-72");
    expect(bannerSource).toContain("rounded-2xl");
    expect(bannerSource).toContain("justify-end");
    expect(bannerSource).toContain("deniedNote");
  });
});
