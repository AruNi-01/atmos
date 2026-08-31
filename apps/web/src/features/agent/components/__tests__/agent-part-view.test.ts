import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const view = readFileSync(join(import.meta.dir, "../AgentPartView.tsx"), "utf8");

describe("agent part markdown rendering", () => {
  it("renders thinking mermaid with the same markdown components as text", () => {
    expect(view).toContain("MessageResponse");
    expect(view).toContain("ReasoningContent");
    expect(view).toContain("components={reviewComponents as never}");
    const thinkingAt = view.indexOf('part.type === "thinking"');
    const thinkingComponentsAt = view.indexOf(
      "components={reviewComponents as never}",
      thinkingAt,
    );
    expect(thinkingAt).toBeGreaterThan(-1);
    expect(thinkingComponentsAt).toBeGreaterThan(thinkingAt);
  });
});
