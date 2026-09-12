import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyPaneGridItemCount,
  emptyPaneLastItemSpansFullRow,
  planEmptyPaneLauncher,
} from "@/app-shell/center-pane/center-pane-empty-layout";
import { buildDefaultEmptyPaneActions } from "@/app-shell/center-pane/CenterPaneEmptyState";

const emptyState = readFileSync(
  join(import.meta.dir, "../center-pane/CenterPaneEmptyState.tsx"),
  "utf8",
);

describe("empty pane launcher layout", () => {
  it("uses a two-column grid when the pane is wide enough for a pair", () => {
    const plan = planEmptyPaneLauncher({
      width: 360,
      height: 720,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBe(2);
    expect(plan.scroll).toBe(false);
  });

  it("uses two columns in a short portrait pane", () => {
    const plan = planEmptyPaneLauncher({
      width: 360,
      height: 280,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBe(2);
  });

  it("never puts more than two actions on a row", () => {
    const plan = planEmptyPaneLauncher({
      width: 1100,
      height: 700,
      actionCount: 9,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBe(2);
    expect(plan.gridMaxWidth).toBeLessThan(1100 * 0.5);
    expect(plan.scroll).toBe(false);
  });

  it("keeps two columns and scrolls when the pane is short", () => {
    const plan = planEmptyPaneLauncher({
      width: 280,
      height: 180,
      actionCount: 7,
      hasClose: true,
    });
    expect(plan.mode).toBe("grid");
    expect(plan.columns).toBe(2);
    expect(plan.scroll).toBe(true);
  });

  it("falls back to a list when two tiles will not fit", () => {
    const plan = planEmptyPaneLauncher({
      width: 160,
      height: 720,
      actionCount: 7,
    });
    expect(plan.columns).toBe(1);
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
    expect(emptyState).toContain("data-center-pane-empty-columns={plan.columns}");
  });

  it("spans the last tile across the row when the count is odd", () => {
    expect(emptyPaneLastItemSpansFullRow(9, 2)).toBe(true);
    expect(emptyPaneLastItemSpansFullRow(7, 2)).toBe(true);
    expect(emptyPaneLastItemSpansFullRow(1, 2)).toBe(true);
    expect(emptyPaneLastItemSpansFullRow(8, 2)).toBe(false);
    expect(emptyPaneLastItemSpansFullRow(10, 2)).toBe(false);
    expect(emptyPaneLastItemSpansFullRow(9, 1)).toBe(false);
    expect(emptyPaneLastItemSpansFullRow(0, 2)).toBe(false);
    expect(emptyPaneGridItemCount(9, false)).toBe(9);
    expect(emptyPaneLastItemSpansFullRow(emptyPaneGridItemCount(9, false), 2)).toBe(
      true,
    );
    expect(emptyPaneLastItemSpansFullRow(emptyPaneGridItemCount(9, true), 2)).toBe(
      false,
    );
    expect(emptyPaneLastItemSpansFullRow(emptyPaneGridItemCount(6, true), 2)).toBe(
      true,
    );
    expect(emptyState).toContain("emptyPaneLastItemSpansFullRow");
    expect(emptyState).toContain("[&>*:last-child]:col-span-full");
  });

  it("uses rounded borders on compact tiles", () => {
    expect(emptyState).toContain("CENTER_STAGE_RADIUS_CLASS");
    expect(emptyState).toContain("border border-border");
    expect(emptyState).toContain("hover:bg-accent");
    expect(emptyState).not.toContain("[&:nth-child(odd):not(:last-child)]:border-r");
    expect(emptyState).not.toContain("bg-muted/35");
    expect(emptyState).not.toContain("ring-1 ring-border/40");
    expect(emptyPaneGridItemCount(9, true)).toBe(10);
    expect(emptyPaneGridItemCount(8, true)).toBe(9);
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

  it("omits git widgets for standalone automation empty panes", () => {
    const labels = {
      terminal: "Terminal",
      files: "Files",
      changes: "Changes",
      review: "Review",
      run: "Run",
      github: "GitHub",
      simulator: "Simulator",
    };
    const noop = () => {};
    const hidden = buildDefaultEmptyPaneActions({
      labels,
      modKey: "⌘",
      hideGitChrome: true,
      onCreateTerminal: noop,
      onCreateToolTab: noop,
      onCreateSimulator: noop,
    }).map((action) => action.id);
    expect(hidden).not.toContain("changes");
    expect(hidden).not.toContain("review");
    expect(hidden).not.toContain("github");
    expect(hidden).toContain("files");
    expect(hidden).toContain("run");

    const shown = buildDefaultEmptyPaneActions({
      labels,
      modKey: "⌘",
      onCreateTerminal: noop,
      onCreateToolTab: noop,
      onCreateSimulator: noop,
    }).map((action) => action.id);
    expect(shown).toEqual(expect.arrayContaining(["changes", "review", "github"]));
  });
});
