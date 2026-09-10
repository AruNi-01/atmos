import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("hosted remote onboarding identity", () => {
  test("requires Hub sign-in instead of an access key paste field", () => {
    const source = readFileSync(
      join(import.meta.dir, "../HostedWelcomeGate.tsx"),
      "utf8",
    );
    expect(source).toContain("HubSignInDialog");
    expect(source).toContain("hosted.remote.signInTitle");
    expect(source).toContain("ensureLocalHubDevice");
    expect(source).not.toContain("Paste access key");
    expect(source).not.toContain("hosted.remote.accessKeyPlaceholder");
    expect(source).not.toContain("hosted.remote.generateKey");
    expect(source).not.toContain("hosted.remote.useKey");
    expect(source).not.toContain("onGenerateToken");
    expect(source).not.toContain("onSaveToken");
  });
});
