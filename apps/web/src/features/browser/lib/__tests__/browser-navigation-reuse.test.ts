import { describe, expect, it } from "bun:test";

import { shouldReuseLoadedBrowserGuest } from "../browser-navigation-reuse";

describe("shouldReuseLoadedBrowserGuest", () => {
  it("reuses when the guest already shows the requested URL", () => {
    expect(
      shouldReuseLoadedBrowserGuest({
        currentUrl: "https://example.com/app",
        requestedUrl: "https://example.com/app",
      }),
    ).toBe(true);
    expect(
      shouldReuseLoadedBrowserGuest({
        currentUrl: "example.com/app",
        requestedUrl: "https://example.com/app",
      }),
    ).toBe(true);
  });

  it("does not reuse an empty or different URL", () => {
    expect(
      shouldReuseLoadedBrowserGuest({
        currentUrl: "",
        requestedUrl: "https://example.com",
      }),
    ).toBe(false);
    expect(
      shouldReuseLoadedBrowserGuest({
        currentUrl: "https://example.com/a",
        requestedUrl: "https://example.com/b",
      }),
    ).toBe(false);
  });
});
