import { describe, expect, test } from "bun:test";
import {
  HISTORY_COLUMN_DEFAULTS,
  HISTORY_COLUMN_MINS,
  applyHistoryColumnResize,
  clampHistoryColumnWidth,
  historyColumnDividerOffsets,
  historyGridTemplate,
  historyTableWidth,
  resolveHistoryColumnWidths,
} from "./git-history-columns";

describe("git history column widths", () => {
  test("clamps each column to its minimum", () => {
    expect(clampHistoryColumnWidth("description", 10)).toBe(HISTORY_COLUMN_MINS.description);
    expect(clampHistoryColumnWidth("graph", 10, 80)).toBe(80);
    expect(clampHistoryColumnWidth("date", 200)).toBe(200);
  });

  test("resize only changes the dragged column", () => {
    const next = applyHistoryColumnResize(HISTORY_COLUMN_DEFAULTS, "description", 240);
    expect(next.description).toBe(240);
    expect(next.date).toBe(HISTORY_COLUMN_DEFAULTS.date);
    expect(next.author).toBe(HISTORY_COLUMN_DEFAULTS.author);
    expect(historyTableWidth(next)).toBe(historyTableWidth(HISTORY_COLUMN_DEFAULTS) - 120);
  });

  test("keeps the default description width until the container is measured", () => {
    const resolved = resolveHistoryColumnWidths(HISTORY_COLUMN_DEFAULTS, {
      graphMin: 56,
      containerWidth: 0,
      descriptionPinned: false,
    });
    expect(resolved.description).toBe(HISTORY_COLUMN_DEFAULTS.description);
  });

  test("unpinned description fills leftover container space without overlapping later columns", () => {
    const resolved = resolveHistoryColumnWidths(HISTORY_COLUMN_DEFAULTS, {
      graphMin: 56,
      containerWidth: 1000,
      descriptionPinned: false,
    });
    expect(resolved.date).toBe(HISTORY_COLUMN_DEFAULTS.date);
    expect(resolved.author).toBe(HISTORY_COLUMN_DEFAULTS.author);
    expect(resolved.commit).toBe(HISTORY_COLUMN_DEFAULTS.commit);
    expect(historyTableWidth(resolved)).toBe(1000);
    expect(resolved.description).toBe(
      1000 - resolved.graph - resolved.date - resolved.author - resolved.commit,
    );
  });

  test("pinned description keeps its width so neighbors stay put", () => {
    const pinned = applyHistoryColumnResize(HISTORY_COLUMN_DEFAULTS, "description", 220);
    const resolved = resolveHistoryColumnWidths(pinned, {
      graphMin: 56,
      containerWidth: 1200,
      descriptionPinned: true,
    });
    expect(resolved.description).toBe(220);
    expect(historyTableWidth(resolved)).toBeLessThan(1200);
  });

  test("grid template uses fixed pixel tracks", () => {
    expect(historyGridTemplate(HISTORY_COLUMN_DEFAULTS)).toBe("56px 360px 132px 110px 96px");
  });

  test("divider offsets sit on the trailing edge of each resizable column", () => {
    expect(historyColumnDividerOffsets(HISTORY_COLUMN_DEFAULTS)).toEqual({
      graph: 56,
      description: 416,
      date: 548,
      author: 658,
    });
  });
});
