import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dropdown = readFileSync(
  join(import.meta.dir, "../ConfigOptionDropdown.tsx"),
  "utf8",
);

describe("config option dropdown", () => {
  it("pins search above the select viewport and caps list height", () => {
    expect(dropdown).toContain('className="max-h-[min(20rem,var(--radix-select-content-available-height))]"');
    expect(dropdown).toContain("header={");
    expect(dropdown).not.toContain("sticky top-0");
    expect(dropdown).toContain("chatPanel.pickers");
    expect(dropdown).toContain("thinkingLevels");
    expect(dropdown).toContain("permissionModes");
    expect(dropdown).toContain("permissionModeMessageKey");
    expect(dropdown).toContain("configKindMatches");
  });
});
