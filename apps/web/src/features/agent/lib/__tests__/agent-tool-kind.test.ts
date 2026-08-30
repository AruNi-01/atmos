import { describe, expect, it } from "bun:test";
import { planFromToolInput, classifyTool, thinkingText, isGenericToolLabel } from "@/features/agent/lib/agent-tool-kind";
import { deriveToolDisplayName, getTerminalCommandString } from "@/features/agent/lib/chat-helpers";

describe("classifyTool", () => {
  it("maps provider names onto closed kinds", () => {
    expect(classifyTool("Read")).toEqual({ type: "tool", kind: "read" });
    expect(classifyTool("Bash")).toEqual({ type: "tool", kind: "execute" });
    expect(classifyTool("think")).toEqual({ type: "thinking" });
    expect(classifyTool("TodoWrite")).toEqual({ type: "plan" });
    expect(classifyTool("SwitchMode")).toEqual({ type: "hide" });
    expect(classifyTool("Task", null, { subagent_type: "explore" })).toEqual({
      type: "tool",
      kind: "subagent",
    });
    expect(classifyTool("Web search")).toEqual({ type: "tool", kind: "search" });
    expect(classifyTool("WebFetch")).toEqual({ type: "tool", kind: "fetch" });
    expect(classifyTool("Tool", null, {
      backend: true,
      action: { type: "search", query: "example", sources: [{ url: "https://example.com/repo" }] },
    })).toEqual({ type: "tool", kind: "search" });
    expect(classifyTool("Tool", null, { url: "https://example.com/page" })).toEqual({
      type: "tool",
      kind: "fetch",
    });
    expect(classifyTool("Web search", null, {
      action: { type: "open_page", url: "https://example.com/page" },
    })).toEqual({ type: "tool", kind: "fetch" });
    expect(classifyTool("Tool", null, {}, [
      'URL Content from: "https://example.com/page"',
      "Title: Example",
      "Status: 200",
      "Markdown content:",
      "# Hello",
    ].join("\n"))).toEqual({ type: "tool", kind: "fetch" });
    expect(classifyTool("Tool", null, {}, { type: "ReadFile", FileContent: { absolute_path: "/tmp/a.ts" } })).toEqual({
      type: "tool",
      kind: "read",
    });
    expect(classifyTool("Read", null, {}, "Loaded 2 tool(s): WebSearch, FetchUrl")).toEqual({
      type: "tool",
      kind: "other",
    });
  });

  it("reads thinking text and todo plans from tool payloads", () => {
    expect(thinkingText({ title: "hmm" })).toBe("hmm");
    expect(planFromToolInput({ todos: [{ content: "Inspect", status: "pending" }] })).toEqual({
      entries: [{ content: "Inspect", priority: "medium", status: "pending" }],
    });
  });
});

describe("cursor-style tool titles", () => {
  it("treats ACP kind names as generic so path and command can win", () => {
    expect(isGenericToolLabel("Read")).toBe(true);
    expect(isGenericToolLabel("Search")).toBe(true);
    expect(isGenericToolLabel("Run Script")).toBe(true);
    expect(isGenericToolLabel("ReadFile")).toBe(false);
  });

  it("still extracts file, query, and command from Cursor payloads", () => {
    expect(deriveToolDisplayName("Read", "Read", { path: "/tmp/app/README.md", offset: 1, limit: 80 }))
      .toMatch(/README\.md/);
    expect(deriveToolDisplayName("Search", "Search", { pattern: "ActivityIndicator" }))
      .toMatch(/ActivityIndicator/);
    expect(getTerminalCommandString({ command: "echo hello" })).toBe("echo hello");
    expect(getTerminalCommandString({ args: { command: "ls -la" } })).toBe("ls -la");
  });
});
