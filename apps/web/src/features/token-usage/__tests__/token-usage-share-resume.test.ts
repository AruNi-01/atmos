import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetTokenUsageShareResumeForTests,
  __seedTokenUsageShareResumeForTests,
  applyTokenUsageShareResumeToPath,
  markTokenUsageShareResume,
  takeTokenUsageShareResume,
} from "../token-usage-share-resume";

afterEach(() => {
  __resetTokenUsageShareResumeForTests();
});

describe("token usage share resume", () => {
  test("stores and consumes the tab once", () => {
    markTokenUsageShareResume("publish");
    expect(takeTokenUsageShareResume()).toBe("publish");
    expect(takeTokenUsageShareResume()).toBeNull();
  });

  test("stamps /token-usage return paths with the resume tab", () => {
    markTokenUsageShareResume("publish");
    expect(applyTokenUsageShareResumeToPath("/token-usage")).toBe(
      "/token-usage?share=publish",
    );
    expect(applyTokenUsageShareResumeToPath("/settings")).toBe("/settings");
  });

  test("ignores expired payloads", () => {
    __seedTokenUsageShareResumeForTests({
      tab: "publish",
      at: Date.now() - 20 * 60 * 1000,
    });
    expect(takeTokenUsageShareResume()).toBeNull();
  });
});
