import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const messagesDir = join(import.meta.dir, "../../../messages");
const specsDir = join(import.meta.dir, "../../../../../specs/APP");
const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8")) as Record<
  string,
  unknown
>;
const zh = JSON.parse(readFileSync(join(messagesDir, "zh.json"), "utf8")) as Record<
  string,
  unknown
>;

function at(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

const KEYS = [
  "Agent.components.chatPanel.planShowLess",
  "Agent.components.chatPanel.planShowMore",
  "Agent.components.chatPanel.downloadPlan",
  "Terminal.chrome.status.connecting",
  "Terminal.chrome.status.reconnecting",
  "Terminal.chrome.status.disconnected",
  "Terminal.chrome.status.restoreFailed",
  "Terminal.chrome.search.placeholder",
  "Terminal.chrome.search.previousMatch",
  "Terminal.chrome.search.nextMatch",
  "Terminal.chrome.search.close",
  "Terminal.chrome.actions.new",
  "Terminal.chrome.actions.retry",
  "Terminal.chrome.scrollToBottom",
  "project.deleteProjectDialog.title",
  "project.deleteProjectDialog.description",
  "project.deleteProjectDialog.activeWorkspaces",
  "project.deleteProjectDialog.confirmLabel",
  "project.deleteProjectDialog.actions.cancel",
  "project.deleteProjectDialog.actions.delete",
  "project.deleteProjectDialog.actions.close",
  "shared.markdownRenderer.mermaid.errors.renderFailed",
] as const;

describe("QUALITY-030 message keys", () => {
  test("new and reused keys exist in en and zh", () => {
    for (const key of KEYS) {
      expect(typeof at(en, key)).toBe("string");
      expect(typeof at(zh, key)).toBe("string");
    }
  });

  test("zh appshot promptBody is Chinese and keeps path identifiers", () => {
    const body = at(zh, "appshot.lib.protocol.promptBody");
    expect(typeof body).toBe("string");
    const text = String(body);
    expect(text).toContain("{timestamp}");
    expect(text).toContain("~/.atmos/appshots/records/{timestamp}/");
    expect(text).toContain("metadata.json");
    expect(text).toContain("context.md");
    expect(text).toContain("snapshot.png");
    expect(text).toMatch(/[\u4e00-\u9fff]/);
    expect(text).not.toContain("Appshot record is stored locally");
  });

  test("zh mermaid renderFailed is not the English default", () => {
    expect(at(zh, "shared.markdownRenderer.mermaid.errors.renderFailed")).not.toBe(
      "Failed to render mermaid diagram",
    );
  });

  test("APP-079 TECH marks mobile mermaid SVG and full highlight as known non-goals", () => {
    const tech = readFileSync(join(specsDir, "APP-079_mobile-agent-chat/TECH.md"), "utf8");
    expect(tech).toContain("## Known non-goals (QUALITY-030)");
    expect(tech).toContain("mermaid→SVG");
    expect(tech).toContain("syntax-highlighter");
    expect(tech).toContain("QUALITY-030");
  });
});
