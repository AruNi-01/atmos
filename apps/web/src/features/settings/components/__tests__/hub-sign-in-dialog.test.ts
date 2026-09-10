import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("HubSignInDialog", () => {
  test("mints a Hub device after OAuth instead of accepting a pasted access key", () => {
    const source = readFileSync(
      join(import.meta.dir, "../HubSignInDialog.tsx"),
      "utf8",
    );
    expect(source).toContain("AuthView");
    expect(source).toContain("await ensureLocalHubDevice()");
    expect(source).toContain("HubAuthUIProvider");
    expect(source).not.toContain("access key");
  });
});
