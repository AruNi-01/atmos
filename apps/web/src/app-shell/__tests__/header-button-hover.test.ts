import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("header button hover", () => {
  it("gives light chrome a gray well so the white center stage reads as a card", () => {
    const tokens = read("../../../../../packages/ui/src/styles/globals.css");
    const root = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf(".dark {"));
    expect(root).toContain("--sidebar: oklch(0.94");
    expect(root).toContain("--background: oklch(1 0 0)");
    expect(root).not.toContain("--sidebar: oklch(0.985");

    const app = read("../../app/globals.css");
    expect(app).toContain("html.light {");
    expect(app).toContain("background-color: oklch(0.94 0.003 286)");
  });

  it("gives header chips a solid light fill so they do not wash into the titlebar", () => {
    const parts = read("../header-parts.tsx");
    expect(parts).toContain("HEADER_CHIP_SURFACE_CLASS");
    expect(parts).toContain("bg-muted dark:border-transparent dark:bg-muted/40");
    expect(parts).not.toContain('"bg-muted/40');

    const quickOpen = read("../QuickOpen.tsx");
    const git = read("../header-git-context.tsx");
    const actions = read("../header-action-controls.tsx");
    expect(quickOpen).toContain("HEADER_CHIP_SURFACE_CLASS");
    expect(git).toContain("HEADER_CHIP_SURFACE_CLASS");
    expect(actions).toContain("HEADER_CHIP_SURFACE_CLASS");
    expect(quickOpen).not.toContain("bg-muted/40 hover:bg-muted/60");
    expect(actions).not.toContain(
      "bg-muted/40 hover:bg-muted/60 text-muted-foreground",
    );
  });

  it("makes chrome icon buttons instant, without a color fade", () => {
    const header = read("../Header.tsx");
    expect(header).toContain("hover:bg-accent hover:text-accent-foreground");
    expect(header).not.toContain("transition-colors hover:bg-accent");
    expect(header).not.toContain("hover:bg-accent transition-colors");

    const actions = read("../header-action-controls.tsx");
    expect(actions).toContain("hover:bg-accent hover:text-accent-foreground");
    expect(actions).not.toContain("transition-colors duration-200 ease-out hover:bg-accent");

    const bell = read("../HeaderAttentionBell.tsx");
    expect(bell).not.toContain("transition-colors duration-200");

    const quota = read("../QuotaPopover.tsx");
    expect(quota).toContain(
      'className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"',
    );
  });
});
