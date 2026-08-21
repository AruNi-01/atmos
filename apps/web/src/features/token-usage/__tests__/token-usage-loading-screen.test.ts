// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dirname;

function read(rel: string) {
  return readFileSync(join(dir, rel), "utf8");
}

describe("TokenUsageLoadingScreen", () => {
  it("is the shared TerminalLoader plus rotating tips", () => {
    const source = read("../TokenUsageLoadingScreen.tsx");
    expect(source).toContain("TerminalLoader");
    expect(source).toContain("loading.tips.");
    expect(source).toContain("heatmap.loadingDescription");
  });

  it("covers Token Usage, other/All computers, public share, and leaderboard", () => {
    const page = read("../../../app-shell/TokenUsagePage.tsx");
    expect(page).toContain("TokenUsageLoadingScreen");
    expect(page).toContain("{loading ? (");
    expect(page).not.toContain("isCurrentScope && loading");

    const tok = read("../../../app/tok/page.tsx");
    expect(tok).toContain("TokenUsageLoadingScreen");
    expect(tok).not.toContain("Loader2");
  });
});
