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
    expect(rowClass).toContain("cursor-pointer");
    expect(rowClass).not.toContain("cursor-grab");
    expect(rowClass).not.toContain("active:cursor-grabbing");
    expect(rowClass).not.toContain("transition-colors");
    expect(rowClass).not.toContain("hover:bg-sidebar-accent/70");
  });

  it("shows the grabbing cursor only while a grouped tab is being dragged", () => {
    expect(tabs).toContain('isDragging && "z-10 cursor-grabbing opacity-70 shadow-md"');
    expect(tabs).toContain('document.body.style.cursor = "grabbing"');
  });

  it("keeps a gap between grouped tab items so hover fills do not touch", () => {
    expect(tabs).toContain("flex w-full min-w-0 flex-col gap-1");
  });

  it("keeps the grouping trigger hover fill circular", () => {
    expect(tabs).toContain(
      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
    );
    expect(tabs).not.toContain('variant="ghost"');
  });

  it("hands close into the leading icon slot instead of a trailing button", () => {
    expect(tabs).toContain("renderContent(");
    expect(tabs).toContain("onClose: () => onClose(tab)");
    expect(tabs).not.toContain("group-hover/tab-item:opacity-100");
    expect(tabs).not.toContain("<X className=\"size-3\" />");
  });
});
