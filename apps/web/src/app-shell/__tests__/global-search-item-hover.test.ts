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
    expect(parts).toContain("hover:bg-foreground/8 hover:text-accent-foreground");
    expect(parts).toContain("data-[selected=true]:bg-foreground/8");
    expect(parts).toContain("rounded-xl");
    expect(parts).not.toContain("hover:bg-accent hover:text-accent-foreground");
    expect(parts).not.toContain("in-[[data-slot=command-list]:not(:hover)]");
    expect(parts).not.toContain("transition-colors group-data-[selected=true]");
    expect(parts).not.toContain("transition-opacity group-data-[selected=true]");
  });

  it("keeps result item icon color and tile background unchanged on hover and selection", () => {
    expect(parts).toContain("group-hover:bg-muted");
    expect(parts).toContain("group-data-[selected=true]:bg-muted");
    expect(parts).toContain("group-hover:text-muted-foreground");
    expect(parts).toContain("group-data-[selected=true]:text-muted-foreground");
    expect(parts).not.toContain("group-hover:bg-background");
    expect(parts).not.toContain("group-data-[selected=true]:bg-background");
    expect(parts).not.toContain("group-hover:text-primary");
    expect(parts).not.toContain("group-data-[selected=true]:text-primary");
  });

  it("keeps cmdk-selected fill visible so keyboard navigation is not hidden by list hover", () => {
    expect(command).toContain("hover:bg-accent hover:text-accent-foreground");
    expect(command).toContain("data-[selected=true]:bg-accent");
    expect(command).not.toContain("[data-selected=true]:not(:hover)]:bg-transparent");
    expect(command).not.toContain("transition-colors");
  });

  it("rounds the command dialog shell more than the default dialog", () => {
    expect(command).toContain("overflow-hidden rounded-2xl p-0");
    expect(command).toContain("rounded-[inherit]");
  });
});
