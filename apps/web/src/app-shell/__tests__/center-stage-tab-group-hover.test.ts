import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tabs = readFileSync(
  join(import.meta.dir, "../center-stage-tabs.tsx"),
  "utf8",
);

describe("center tab group popover hover", () => {
  it("uses instant full-accent hover on grouped tab items", () => {
    const rowClass = tabs.slice(
      tabs.indexOf("group/tab-item"),
      tabs.indexOf("isDragging &&"),
    );
    expect(rowClass).toContain("hover:bg-accent");
    expect(rowClass).not.toContain("transition-colors");
    expect(rowClass).not.toContain("hover:bg-sidebar-accent/70");
  });

  it("keeps a gap between grouped tab items so hover fills do not touch", () => {
    expect(tabs).toContain("flex w-full min-w-0 flex-col gap-1");
  });

  it("hands close into the leading icon slot instead of a trailing button", () => {
    expect(tabs).toContain("renderContent(");
    expect(tabs).toContain("onClose: () => onClose(tab)");
    expect(tabs).not.toContain("group-hover/tab-item:opacity-100");
    expect(tabs).not.toContain("<X className=\"size-3\" />");
  });
});
