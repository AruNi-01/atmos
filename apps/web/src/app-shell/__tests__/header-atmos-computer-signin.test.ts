import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("header Atmos Computer popover identity", () => {
  test("offers Hub sign-in instead of an access key form", () => {
    const source = readFileSync(
      join(import.meta.dir, "../header-action-controls.tsx"),
      "utf8",
    );
    expect(source).toContain("HubSignInDialog");
    expect(source).toContain("onOpenHubSignIn");
    expect(source).toContain("remoteAccess.signIn");
    expect(source).not.toContain("onOpenAccountSettings");
    expect(source).not.toContain("Paste access key");
  });
});
