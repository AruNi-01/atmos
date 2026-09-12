import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("subagent tools use the standard collapsed tool row", () => {
  const source = readFileSync(join(import.meta.dir, "../SubAgentBlockView.tsx"), "utf8");
  const toolView = readFileSync(join(import.meta.dir, "../ToolView.tsx"), "utf8");

  expect(source).toContain("<AgentToolCard");
  expect(source).toContain("<SubAgentBlockBody");
  expect(source).toContain("defaultOpen = false");
  expect(source).toContain("defaultOpen={defaultOpen}");
  expect(source).toContain('getToolKindIcon("subagent")');
  expect(source).toContain('rounded-xl border border-border/70 bg-muted/10');
  expect(toolView).toContain("<SubAgentBlockView");
  expect(toolView).toContain("childTools={directChildTools}");
  expect(toolView).toContain("allTools={childTools}");
});
