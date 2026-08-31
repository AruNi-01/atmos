import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "../AgentActivityIndicator.tsx"),
  "utf8",
);

describe("agent activity indicator", () => {
  it("swaps streaming glyph and status copy with the same text-effect exit animation", () => {
    expect(source).toContain("TextEffect");
    expect(source).toContain("textEffectBlurSlideVariants");
    expect(source).toContain('per="char"');
    expect(source).toContain("leading=");
    expect(source).toContain("<ActivityIndicator");
    expect(source).toContain("const label = `${activity.label}...`");
    expect(source).toContain("{label}");
  });

  it("keeps the traveling shimmer on the status copy after the enter animation", () => {
    expect(source).toContain("shimmering");
    expect(source).toContain("shimmer");
    expect(source).toContain("label={label}");
  });
});
