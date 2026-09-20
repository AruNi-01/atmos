import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("header window drag", () => {
  it("gives the empty header above the center stage a hittable desktop drag region", () => {
    const header = read("../Header.tsx");
    expect(header).toContain("HeaderWindowDragFiller");
    expect(header).toContain('data-desktop-window-drag=""');
    expect(header).toContain("flex-1 self-stretch");
    expect(header).toContain('enabled && "desktop-drag-region"');
    expect(header).toContain("relative z-10 desktop-no-drag flex shrink-0 items-center gap-6");
    expect(header).toContain("relative z-10 desktop-no-drag flex min-w-0 items-center gap-5");
    expect(header).not.toContain("pointer-events-none absolute inset-0 z-0 desktop-drag-region");
    expect(header).not.toContain("justify-between px-4");

    const actions = read("../header-action-controls.tsx");
    expect(actions).toContain(
      "relative z-10 desktop-no-drag flex shrink-0 items-center justify-end space-x-3",
    );
  });
});
