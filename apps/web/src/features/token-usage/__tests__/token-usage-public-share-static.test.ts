// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../../../../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("APP-061 static wiring", () => {
  it("public page composes the same overview view and shell", () => {
    expect(existsSync(join(root, "apps/web/src/app/tok/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "apps/landing/src/app/tok"))).toBe(false);
    const page = read("apps/web/src/features/token-usage/PublicTokPage.tsx");
    expect(page).toContain("TokenUsageOverviewView");
    expect(page).toContain("payload={payload}");
    expect(page).toContain("@{handle}");
    expect(page).toContain("https://x.com/");
    expect(page).toContain("https://github.com/");
    expect(page).toContain("https://atmos.land");
    expect(page).toContain("overflow-y-auto");
    expect(page).toContain("PublicTokLeaderboards");
    expect(page).toContain("leaderboardLink");
    expect(page).toContain("/tok/leaderboard");
    const boards = read(
      "apps/web/src/features/token-usage/PublicTokLeaderboards.tsx",
    );
    expect(boards).toContain("Crown");
    expect(boards).toContain("SlidingMetric");
    expect(boards).toContain("compactSlidingParts");
    expect(boards).toContain("useEnterValue");
    expect(page).toContain("generatedByPrefix");
    expect(page).not.toContain("TokenUsageCookieConsentBanner");
    expect(page).not.toContain("TokenUsageSharePopover");
  });

  it("local page keeps PNG, consent, and does not auto-upload", () => {
    const local = read("apps/web/src/app-shell/TokenUsagePage.tsx");
    expect(local).toContain("TokenUsageSharePopover");
    expect(local).toContain("TokenUsageCookieConsentBanner");
    expect(local).toContain("TokenUsageOverviewView");
    expect(local).toContain("tokenUsageApi.getOverview");
    expect(local).not.toContain("hubPutUsagePage");
    expect(local).toContain("Does not upload to Hub");
  });

  it("share URL copy uses atmos.land/tok/@", () => {
    const publish = read(
      "apps/web/src/features/token-usage/TokenUsagePublishControls.tsx",
    );
    expect(publish).toContain("https://atmos.land/tok/@");
    const hub = read("packages/hub/src/usage-page.ts");
    expect(hub).toContain('https://atmos.land');
    expect(hub).toContain("/tok/@");
  });

  it("does not add a share-view package", () => {
    expect(existsSync(join(root, "packages/usage-share-view"))).toBe(false);
    expect(existsSync(join(root, "packages/share"))).toBe(false);
  });
});
