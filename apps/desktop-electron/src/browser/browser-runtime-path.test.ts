import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBrowserRuntimeScriptPath } from "./browser-runtime-path.ts";

describe("resolveBrowserRuntimeScriptPath", () => {
  it("prefers dist-local browser-runtime.js (packaged layout)", () => {
    const dir = mkdtempSync(join(tmpdir(), "atmos-browser-runtime-"));
    const local = join(dir, "browser-runtime.js");
    writeFileSync(local, "/* shipped */");
    expect(resolveBrowserRuntimeScriptPath(dir, "/nonexistent-repo")).toBe(local);
  });

  it("falls back to monorepo packages/shared path when dist copy missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "atmos-browser-runtime-empty-"));
    const repo = mkdtempSync(join(tmpdir(), "atmos-repo-"));
    const monorepoPath = join(repo, "packages/shared/browser/browser-runtime.js");
    mkdirSync(join(repo, "packages/shared/browser"), { recursive: true });
    writeFileSync(monorepoPath, "/* monorepo */");
    expect(resolveBrowserRuntimeScriptPath(dir, repo)).toBe(monorepoPath);
    expect(existsSync(monorepoPath)).toBe(true);
  });
});
