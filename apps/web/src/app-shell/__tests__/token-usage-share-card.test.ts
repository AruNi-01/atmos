// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { shareCardChrome } from "@/app-shell/token-usage-share-card";

describe("shareCardChrome", () => {
  it("reserves top padding so hero type is not flush with the card edge", () => {
    const chrome = shareCardChrome(2);
    expect(chrome.topPad).toBeGreaterThanOrEqual(48);
  });

  it("keeps equal footer padding above the brand line and below the slogan", () => {
    const chrome = shareCardChrome(2);
    const used =
      chrome.footerPadY + chrome.brandSize + chrome.lineGap + chrome.sloganSize;
    expect(chrome.footerH - used).toBe(chrome.footerPadY);
  });
});
