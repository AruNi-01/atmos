// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MarkdownRenderer heading / hr styles", () => {
  it("styles h1–h4 and hr on the elements (survives parent not-prose)", () => {
    const source = readFileSync(
      join(import.meta.dir, "../MarkdownRenderer.tsx"),
      "utf8",
    );
    expect(source).toContain('h1: ({ node: _node');
    expect(source).toContain('h2: ({ node: _node');
    expect(source).toContain('h3: ({ node: _node');
    expect(source).toContain('h4: ({ node: _node');
    expect(source).toContain("hr: ({ node: _node");
    expect(source).toContain("font-semibold");
    expect(source).toContain("my-6 border-border");
  });
});

describe("AgentToolCard not-prose scope", () => {
  it("does not wrap markdown body in not-prose so nested prose can style", () => {
    const source = readFileSync(
      join(
        import.meta.dir,
        "../../../../features/agent/components/tool-results/AgentToolCard.tsx",
      ),
      "utf8",
    );
    expect(source).toContain('className="not-prose flex min-w-0 items-center gap-1"');
    expect(source).not.toContain('className="not-prose w-full min-w-0"');
  });
});
