import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultTerminalOptions } from "../../lib/theme";

const css = readFileSync(
  join(import.meta.dir, "../terminal-grid.css"),
  "utf8",
);

describe("terminal overlay scrollbar", () => {
  it("does not ease overlay thumb position or size", () => {
    expect(css).not.toMatch(/div\.slider\s*\{[^}]*transition:\s*all/);
    expect(css).not.toMatch(/xterm-scrollbar > div\s*\{[^}]*transition:\s*all/);
    expect(css).toMatch(/div\.slider\s*\{[^}]*transition:\s*opacity/);
  });

  it("keeps xterm smooth-scroll duration at 0", () => {
    expect(defaultTerminalOptions.smoothScrollDuration).toBe(0);
  });
});
