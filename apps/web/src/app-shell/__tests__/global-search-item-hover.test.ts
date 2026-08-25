import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parts = readFileSync(
  join(import.meta.dir, "../global-search-parts.tsx"),
  "utf8",
);
const command = readFileSync(
  join(import.meta.dir, "../../../../../packages/ui/src/components/ui/command.tsx"),
  "utf8",
);

describe("global search item hover", () => {
  it("uses instant CSS hover fill so scanning the list is not gated on cmdk selected", () => {
    expect(parts).toContain("hover:bg-accent hover:text-accent-foreground");
    expect(parts).toContain("group-hover:bg-background");
    expect(parts).toContain("group-data-[selected=true]:bg-background");
    expect(parts).not.toContain("in-[[data-slot=command-list]:not(:hover)]");
    expect(parts).not.toContain("transition-colors group-data-[selected=true]");
    expect(parts).not.toContain("transition-opacity group-data-[selected=true]");
  });

  it("keeps cmdk-selected fill visible so keyboard navigation is not hidden by list hover", () => {
    expect(command).toContain("hover:bg-accent hover:text-accent-foreground");
    expect(command).toContain("data-[selected=true]:bg-accent");
    expect(command).not.toContain("[data-selected=true]:not(:hover)]:bg-transparent");
    expect(command).not.toContain("transition-colors");
  });
});
