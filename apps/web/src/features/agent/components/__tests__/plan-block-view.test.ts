import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const planBlock = readFileSync(
  join(import.meta.dir, "../PlanBlockView.tsx"),
  "utf8",
);

describe("plan block view", () => {
  it("keeps expanded plan entries free of item and header dividers", () => {
    expect(planBlock).not.toContain("border-b border-border/20");
    expect(planBlock).not.toContain("last:border-b-0");
    expect(planBlock).not.toContain("border-t border-border/40");
    expect(planBlock).not.toContain("divide-y");
    expect(planBlock).toContain("flex items-center gap-2 px-3 py-1.5");
  });

  it("shows a plan icon that morphs to the collapse chevron on header hover", () => {
    const glyph = readFileSync(
      join(import.meta.dir, "../composer-collapse-glyph.tsx"),
      "utf8",
    );
    expect(planBlock).toContain("ComposerCollapseGlyph");
    expect(planBlock).toContain("ListTodo");
    expect(glyph).toContain("ChevronDown");
    expect(glyph).toContain("group-hover:opacity-0");
    expect(glyph).toContain("group-hover:opacity-100");
    expect(glyph).toContain("group-hover:scale-75");
    expect(glyph).toContain("group-hover:scale-100");
    expect(glyph).toContain("duration-[250ms]");
    expect(glyph).toContain("ease-[cubic-bezier(0.22,1,0.36,1)]");
    expect(glyph).toContain("motion-reduce:transition-none");
    expect(glyph).toContain('collapsed ? "-rotate-90"');
  });
});
