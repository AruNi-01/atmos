import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("header button hover", () => {
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
