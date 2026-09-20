import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MD_LIVE_EMBED_KINDS, mdLiveEmbedDefaultLayout } from "./defaults";

describe("md-live embed registry", () => {
  test("first-batch kinds default to card or inline as designed", () => {
    expect([...MD_LIVE_EMBED_KINDS]).toEqual([
      "github-issue",
      "github-pr",
      "file",
      "folder",
    ]);
    expect(mdLiveEmbedDefaultLayout("github-issue")).toBe("card");
    expect(mdLiveEmbedDefaultLayout("github-pr")).toBe("card");
    expect(mdLiveEmbedDefaultLayout("file")).toBe("inline");
    expect(mdLiveEmbedDefaultLayout("folder")).toBe("inline");
    expect(mdLiveEmbedDefaultLayout("future-kind")).toBe("card");
  });

  test("registry resolves unknown kinds to generic fallback", () => {
    const source = readFileSync(join(import.meta.dir, "registry.ts"), "utf8");
    expect(source).toContain("BY_KIND.get(kind) ?? GENERIC_EMBED");
    expect(source).toContain("kind: \"unknown\"");
  });
});
