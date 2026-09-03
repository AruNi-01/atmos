import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { otherToolBodies } from "@/features/agent/lib/tool-results/parse-tool-result";

const view = readFileSync(join(import.meta.dir, "../ToolView.tsx"), "utf8");
const card = readFileSync(join(import.meta.dir, "../tool-results/OtherToolCard.tsx"), "utf8");

describe("S9 generic other tool card", () => {
  it("routes execute to the terminal block and other to one card", () => {
    expect(view).toContain('case "execute":');
    expect(view).toContain("<TerminalBlock");
    expect(view).toContain('case "other":');
    expect(view).toContain("<OtherToolCard");
    expect(card).toContain("part.title || part.name");
    expect(card).toContain("otherToolBodies(part)");
    expect(card).not.toContain("pathFromOtherParams");
    expect(card).not.toContain("AgentToolFileChip");
    expect(card).not.toContain("native");
  });

  it("uses a workspace file chip as the collapsed title for path tools", () => {
    const block = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolResultBlock.tsx"),
      "utf8",
    );
    expect(block).toContain("chipAsTitle");
    expect(block).toContain("titleNode");
    expect(card).not.toContain("pathLike && fileChip");
  });

  it("does not repeat the execute command in the expanded terminal body", () => {
    const terminal = readFileSync(join(import.meta.dir, "../TerminalBlock.tsx"), "utf8");
    expect(terminal).toContain("terminalBlock.title");
    expect(terminal).toContain("output");
    expect(terminal).not.toContain("AgentCommandLine");
  });

  it("pretty-prints other params then result", () => {
    const part: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "t-other",
      name: "VendorTool",
      title: "VendorTool",
      kind: "other",
      status: "completed",
      params: { type: "other", value: { type: "ReadFile", path: "/tmp/a.ts" } },
      result: { type: "other", value: { bytes: 12, ok: true } },
    };
    const bodies = otherToolBodies(part);
    expect(bodies.paramsJson).toContain("ReadFile");
    expect(bodies.paramsJson).toContain("/tmp/a.ts");
    expect(bodies.resultBody).toEqual({
      kind: "json",
      value: JSON.stringify({ bytes: 12, ok: true }, null, 2),
    });
    expect(JSON.stringify(bodies)).not.toContain("native");
  });

  it("does not pretty-print empty other params or results", () => {
    const part: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "t-empty",
      name: "Tool",
      title: "Inspect relay/hub client semantics from code",
      kind: "other",
      status: "completed",
      params: { type: "other", value: {} },
      result: { type: "other", value: {} },
    };
    expect(otherToolBodies(part)).toEqual({ paramsJson: null, resultBody: null });

    const withText: AgentToolCallPart = {
      ...part,
      params: { type: "other", value: null },
      result: { type: "text", text: "relay client uses session tokens" },
    };
    expect(otherToolBodies(withText)).toEqual({
      paramsJson: null,
      resultBody: { kind: "text", value: "relay client uses session tokens" },
    });
  });

  it("hides params already shown in the title and keeps uncovered command args", () => {
    const file: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "t-file",
      name: "Tool",
      title: "/Users/me/app/Cargo.toml",
      kind: "other",
      status: "completed",
      params: { type: "other", value: { file_path: "/Users/me/app/Cargo.toml" } },
      result: { type: "empty" },
    };
    expect(otherToolBodies(file).paramsJson).toBeNull();

    const listed: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "t-ls",
      name: "Tool",
      title: "List apps, crates, packages layout",
      kind: "other",
      status: "completed",
      params: {
        type: "other",
        value: {
          command: "ls apps crates packages",
          description: "List apps, crates, packages layout",
        },
      },
      result: { type: "text", text: "apps\ncrates\n" },
    };
    const bodies = otherToolBodies(listed);
    expect(bodies.paramsJson).toContain("ls apps crates packages");
    expect(bodies.paramsJson).not.toContain("List apps, crates, packages layout");
    expect(bodies.resultBody).toEqual({ kind: "text", value: "apps\ncrates\n" });
  });
});
