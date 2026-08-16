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
    expect(existsSync(join(root, "apps/landing/functions/_middleware.ts"))).toBe(
      true,
    );
    const landingProxy = read(
      "apps/landing/functions/_lib/tok-app-proxy.ts",
    );
    expect(landingProxy).toContain("rewriteTokHtml");
    expect(landingProxy).toContain("https://app.atmos.land");
    expect(landingProxy).toContain("isTokPath");
    const landingRedirects = read("scripts/pages/build-pages-landing.mjs");
    expect(landingRedirects).not.toContain(
      "/tok/* https://app.atmos.land/tok/:splat 302",
    );
    const landingRoutes = read("apps/landing/public/_routes.json");
    expect(landingRoutes).toContain('"/tok/*"');
    expect(landingRoutes).not.toContain('"/_next/*"');
    const page = read("apps/web/src/features/token-usage/PublicTokPage.tsx");
    expect(page).toContain("TokenUsageOverviewView");
    expect(page).toContain("payload={payload}");
    expect(page).toContain("@{handle}");
    expect(page).toContain("https://x.com/");
    expect(page).toContain("https://github.com/");
    expect(page).toContain("https://atmos.land");
    expect(page).toContain("overflow-y-auto");
    expect(page).not.toContain("PublicTokLeaderboards");
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
    const tok = read("apps/web/src/app/tok/page.tsx");
    expect(tok).not.toContain("leaderboards={");
    expect(tok).toContain("fetchPublicLeaderboards");
    expect(tok).toContain("PushPageStack");
    expect(tok).toContain("onOpenProfile");
  });

  it("local page keeps PNG, consent, and does not auto-upload", () => {
    const local = read("apps/web/src/app-shell/TokenUsagePage.tsx");
    expect(local).toContain("TokenUsageSharePopover");
    expect(local).not.toContain("TokenUsagePublishControls");
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
    expect(publish).toContain('prefix="atmos.land/tok/ @"');
    expect(publish).toContain("InputGroup");
    expect(publish).toContain("include_cost: true");
    expect(publish).toContain("{ includeCost: true }");
    expect(publish).toContain("Switch");
    expect(publish).toContain("ExternalLink");
    expect(publish).not.toContain("setIncludeCost");
    expect(publish).not.toContain("PopoverTrigger");
    expect(publish).not.toContain("copyLink");
    const share = read("apps/web/src/app-shell/TokenUsageShareDialog.tsx");
    expect(share).toContain("TokenUsagePublishControls");
    expect(share).toContain("@workspace/ui/components/motion/tabs");
    expect(share).toContain('useState("publish")');
    expect(share.indexOf('value="share"')).toBeLessThan(
      share.indexOf('value="publish"'),
    );
    expect(share).toContain('sticky="always"');
    expect(share).toContain("clampBelowHeader");
    expect(share).toContain("data-token-usage-page-scroll");
    const page = read("apps/web/src/app-shell/TokenUsagePage.tsx");
    expect(page).toContain("data-token-usage-page-scroll");
    const hub = read("packages/hub/src/usage-page.ts");
    expect(hub).toContain("https://atmos.land");
    expect(hub).toContain("/tok/@");
  });

  it("does not add a share-view package", () => {
    expect(existsSync(join(root, "packages/usage-share-view"))).toBe(false);
    expect(existsSync(join(root, "packages/share"))).toBe(false);
  });
});
