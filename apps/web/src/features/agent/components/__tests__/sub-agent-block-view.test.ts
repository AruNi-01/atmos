import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("subagent tools use a collapsed overlay trigger", () => {
  const source = readFileSync(join(import.meta.dir, "../SubAgentBlockView.tsx"), "utf8");
  const toolView = readFileSync(join(import.meta.dir, "../ToolView.tsx"), "utf8");
  const helpers = readFileSync(join(import.meta.dir, "../../lib/chat-helpers.ts"), "utf8");

  expect(source).toContain('t("subAgent.ranTitle"');
  expect(source).toContain("useSubagentOverlay");
  expect(source).toContain('getToolKindIcon("subagent")');
  expect(source).toContain("data-agent-subagent-row");
  expect(source).not.toContain("<AgentToolCard");
  expect(source).not.toContain("<SubAgentBlockBody");
  expect(source).not.toContain("defaultOpen");
  expect(toolView).toContain("<SubAgentBlockView");
  expect(toolView).toContain('case "subagent":');
  expect(toolView).not.toContain("childTools={directChildTools}");
  expect(helpers).toContain('case "subagent":');
  expect(helpers).toContain("BotMessageSquare");
});
