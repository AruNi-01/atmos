import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shared = readFileSync(
  join(import.meta.dir, "../center-stage-shared-tabs.tsx"),
  "utf8",
);
const tabBar = readFileSync(
  join(import.meta.dir, "../CenterStageTabBar.tsx"),
  "utf8",
);

describe("center stage tab hover", () => {
  it("overrides TabsTab's background fade with an instant accent fill", () => {
    expect(shared).toContain("CENTER_STAGE_TAB_CLASS");
    expect(shared).toContain("transition-none");
    expect(shared).toContain("hover:bg-accent");
    expect(shared).not.toContain("hover:bg-muted/50");
    expect(shared).not.toContain("transition-colors");
  });

  it("uses the same instant hover on wiki, terminal, and new-tab chrome", () => {
    expect(tabBar).toContain("CENTER_STAGE_TAB_CLASS");
    expect(tabBar).not.toContain("hover:bg-muted/50");
    expect(tabBar).not.toContain("transition-colors hover:bg-muted");
  });
});
