import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Atmos Computer settings identity", () => {
  test("offers Hub sign-in instead of an access key field", () => {
    const source = readFileSync(
      join(import.meta.dir, "../AtmosComputerSection.tsx"),
      "utf8",
    );
    expect(source).toContain("HubSignInDialog");
    expect(source).toContain("accountT(\"signIn\")");
    expect(source).not.toContain("Paste access key");
    expect(source).not.toContain("generateKey");
  });
});
