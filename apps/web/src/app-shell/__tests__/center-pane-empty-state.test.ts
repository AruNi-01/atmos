import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_PANE_MIN_CARD_WIDTH_PX,
  emptyPaneColumnsFit,
  planEmptyPaneLauncher,
} from "@/app-shell/center-pane/center-pane-empty-layout";

const emptyState = readFileSync(
  join(import.meta.dir, "../center-pane/CenterPaneEmptyState.tsx"),
  "utf8",
);

describe("empty pane launcher layout", () => {
  it("uses a one-column list in a tall portrait pane when every row fits", () => {
    const plan = planEmptyPaneLauncher({
      width: 360,
      height: 720,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("list");
    expect(plan.columns).toBe(1);
    expect(plan.scroll).toBe(false);
  });

  it("uses two card columns in a short portrait pane when the list will not fit", () => {
    const plan = planEmptyPaneLauncher({
      width: 360,
      height: 280,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBe(2);
  });

  it("packs more than two columns in a landscape pane", () => {
    const plan = planEmptyPaneLauncher({
      width: 900,
      height: 320,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBeGreaterThan(2);
    expect(plan.columns).toBeLessThanOrEqual(7);
  });

  it("keeps as many columns as the width allows and scrolls when both axes are tight", () => {
    const plan = planEmptyPaneLauncher({
      width: 280,
      height: 180,
      actionCount: 7,
      hasClose: true,
    });
    const columnsFit = emptyPaneColumnsFit(280 - plan.paddingX * 2, 7);
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBe(columnsFit);
    expect(plan.columns).toBeGreaterThanOrEqual(1);
    expect(plan.scroll).toBe(true);
  });

  it("widens a short wide pane instead of stacking a clipped two-column grid", () => {
    const plan = planEmptyPaneLauncher({
      width: 520,
      height: 340,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBeGreaterThan(2);
    expect(EMPTY_PANE_MIN_CARD_WIDTH_PX).toBeGreaterThan(0);
  });

  it("does not compact an unmeasured or empty launcher", () => {
    expect(
      planEmptyPaneLauncher({ width: 0, height: 400, actionCount: 7 }).mode,
    ).toBe("list");
    expect(
      planEmptyPaneLauncher({ width: 400, height: 0, actionCount: 7 }).mode,
    ).toBe("list");
    expect(
      planEmptyPaneLauncher({ width: 400, height: 400, actionCount: 0 }).mode,
    ).toBe("list");
  });

  it("fills leftover space below the tab bar and scrolls instead of clipping", () => {
    expect(emptyState).toContain("flex-1");
    expect(emptyState).toContain("overflow-y-auto");
    expect(emptyState).toContain("plan.scroll ? \"items-start\"");
    expect(emptyState).toContain("min-h-full items-center");
  });

  it("sizes the card grid from the measured pane, not a hardcoded two-column class", () => {
    expect(emptyState).toContain("planEmptyPaneLauncher");
    expect(emptyState).toContain(
      "gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))`",
    );
    expect(emptyState).not.toContain('"grid grid-cols-2 gap-2"');
    expect(emptyState).toContain('gridColumn: "1 / -1"');
    expect(emptyState).toContain("data-center-pane-empty-columns={plan.columns}");
  });

  it("hides shortcut keys in the card grid", () => {
    expect(emptyState).toContain(
      "!compact && action.shortcutKeys && action.shortcutKeys.length > 0",
    );
  });

  it("puts overview first in the empty-pane launcher", () => {
    expect(emptyState).toContain('id: "overview"');
    expect(emptyState.indexOf('id: "overview"')).toBeLessThan(
      emptyState.indexOf('id: "terminal"'),
    );
  });
});
