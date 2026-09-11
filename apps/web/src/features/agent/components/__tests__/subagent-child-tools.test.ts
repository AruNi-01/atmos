import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const partView = readFileSync(join(import.meta.dir, "../AgentPartView.tsx"), "utf8");
const toolView = readFileSync(join(import.meta.dir, "../ToolView.tsx"), "utf8");
const subagent = readFileSync(join(import.meta.dir, "../SubAgentBlockView.tsx"), "utf8");

describe("subagent child tool rendering", () => {
  it("renders tools linked to a subagent inside its disclosure only", () => {
    expect(partView).toContain("isNestedSubagentChild(part, parts)");
    expect(partView).toContain("childTools={toolParts}");
    expect(toolView).toContain("candidate.parent_tool_call_id === part.tool_call_id");
    expect(toolView).toContain("childTools={directChildTools}");
    expect(toolView).toContain("allTools={childTools}");
    expect(subagent).toContain("childTools.map");
    expect(subagent).toContain("childTools={allTools}");
    expect(subagent).toContain("<ToolView");
  });
});
