// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("TokenUsagePage cookie access banner", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../TokenUsagePage.tsx"),
    "utf8",
  );

  it("renders a bottom-right floating prompt instead of a full-page cookie container", () => {
    expect(source).toContain('overview?.cookie_access === "needed"');
    expect(source).toContain("absolute right-4 bottom-4");
    expect(source).toContain("rounded-2xl");
    expect(source).toContain("w-56");
    expect(source).toContain("data-token-usage-share-exclude");
    expect(source).toContain("tryCookies: true");
  });
});
