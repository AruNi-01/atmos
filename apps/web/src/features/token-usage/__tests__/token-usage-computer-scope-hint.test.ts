// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("TokenUsageComputerScopeHint", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../TokenUsageComputerScopeHint.tsx"),
    "utf8",
  );

  it("offers Hub sign-in and sends one-computer users to Atmos Computer", () => {
    expect(source).toContain("HubSignInDialog");
    expect(source).toContain('openSettings("remote-access", "atmos-computer")');
    expect(source).not.toContain('openSettings("account")');
    expect(source).toContain("hintSignInTooltip");
    expect(source).toContain("hintAddComputerTooltip");
  });
});
