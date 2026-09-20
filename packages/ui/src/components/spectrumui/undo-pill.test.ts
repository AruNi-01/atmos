import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("UndoPill source", () => {
  const source = readFileSync(join(import.meta.dir, "undo-pill.tsx"), "utf8");

  it("vendors Spectrum UndoPill on motion with a 5s countdown", () => {
    expect(source).toContain("Spectrum UI — UndoPill");
    expect(source).toContain('from "motion/react"');
    expect(source).not.toContain("framer-motion");
    expect(source).toContain("duration = 5");
    expect(source).toContain('role="status"');
    expect(source).toContain('data-slot="undo-pill"');
    expect(source).toContain("bg-foreground");
    expect(source).toContain("@workspace/ui/lib/utils");
  });
});
