import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("task drawer insets", () => {
  it("measures the floating center card, not the panel that includes the footer", () => {
    const src = read(
      "apps/web/src/features/task/components/task-github-drawer/use-task-drawer-insets.ts",
    );
    expect(src).toContain("CENTER_STAGE_CARD_ATTR");
    expect(src).toContain("CENTER_STAGE_BODY_ATTR");
    expect(src).toContain("APP_FOOTER_HEIGHT_PX");
    expect(src).toContain("APP_HEADER_HEIGHT_PX");
    expect(src).toContain("CENTER_STAGE_GUTTER_Y_PX");
    expect(src).toMatch(/queryCenterStageCard[\s\S]*queryCenterStageBody[\s\S]*queryCenterStagePanel/);
  });
});
