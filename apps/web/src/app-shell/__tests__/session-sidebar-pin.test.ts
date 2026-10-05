import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("session sidebar pin", () => {
  it("swaps the agent icon for pin or unpin and keeps archive actions on the right", () => {
    const source = readFileSync(
      join(import.meta.dir, "../sidebar/SessionSidebarList.tsx"),
      "utf8",
    );
    const row = source.slice(
      source.indexOf("function SessionSidebarRow"),
      source.indexOf("function DeleteOption"),
    );

    expect(row).toContain('role="button"');
    expect(row).toContain("onClick={activate}");
    expect(row).toContain("group-hover/session:invisible");
    expect(row).toContain('chromeT(isPinned ? "common.unpin" : "common.pin")');
    expect(row).toContain('cn("size-3.5", !isPinned && "rotate-45")');
    expect(row).toContain("group-hover/session:flex");
    expect(row).not.toContain("size-6 shrink-0 cursor-pointer");
    expect(row).toContain('title={viewT("view.archive")}');
    expect(row).toContain('title={chromeT("common.delete")}');
  });
});
