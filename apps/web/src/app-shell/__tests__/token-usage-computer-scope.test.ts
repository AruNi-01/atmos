// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Token Usage Computer scope chrome", () => {
  const pageSource = readFileSync(
    join(import.meta.dirname, "../TokenUsagePage.tsx"),
    "utf8",
  );

  it("places the Computer select immediately left of Share", () => {
    const selectAt = pageSource.indexOf("<TokenUsageComputerSelect");
    const shareAt = pageSource.indexOf("<TokenUsageSharePopover");
    expect(selectAt).toBeGreaterThan(0);
    expect(shareAt).toBeGreaterThan(selectAt);
  });

  it("does not switch the workbench Computer from Token Usage", () => {
    expect(pageSource).not.toContain("createHostedRemoteSession");
    expect(pageSource).not.toContain("setSelectedServerId");
    expect(pageSource).not.toContain("setConnectionMode");
  });

  it("gates cookie consent to the current Computer scope", () => {
    expect(pageSource).toContain("isCurrentScope ? overview?.browser_cookie_access");
  });

  it("shares the displayed overview rather than the workbench cache only", () => {
    expect(pageSource).toContain("totalTokens={overview?.summary.total_tokens");
    expect(pageSource).toContain("overview={overview}");
  });
});
