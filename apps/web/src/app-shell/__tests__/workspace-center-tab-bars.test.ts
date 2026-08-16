import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const host = readFileSync(
  join(import.meta.dir, "../workspace-center-tab-bars.tsx"),
  "utf8",
);
const stage = readFileSync(
  join(import.meta.dir, "../CenterStage.tsx"),
  "utf8",
);
const css = readFileSync(
  join(import.meta.dir, "../../app/globals.css"),
  "utf8",
);

describe("workspace center tab chrome keep-alive", () => {
  it("stacks one tab strip per context and hides with data-tier", () => {
    expect(host).toContain('data-workspace-tabbar={contextId}');
    expect(host).toContain('data-tier={isPaintActive ? "active" : "warm"}');
    expect(stage).toContain("WorkspaceCenterTabBars");
    expect(stage).not.toContain("<CenterStageTabBar");
  });

  it("uses the same opacity hide as workspace frames", () => {
    expect(css).toContain('[data-workspace-tabbar][data-tier="warm"]');
    expect(css).toContain('[data-workspace-tabbar][data-tier="active"]');
  });
});
