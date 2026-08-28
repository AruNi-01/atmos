import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc;
}

describe("S15 Agent Chat modules do not import ACP schema types", () => {
  it("denies vendor ACP schema and session/list identity imports in host modules", () => {
    const files = walk(ROOT).filter((path) => {
      return (
        path.includes("/components/AgentChatWorkspace") ||
        path.includes("/components/AgentChatPanel") ||
        path.includes("/components/AgentChatStandalonePage") ||
        path.includes("/lib/followup-policy") ||
        path.includes("/lib/group-conversations") ||
        path.includes("/lib/conversation-") ||
        path.includes("/store/use-agent-chat-center-tabs")
      );
    });
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("agent-client-protocol");
      expect(source).not.toContain("acp_session_id");
      expect(source).not.toMatch(/["'`]\/ws\/agent(?:\/|"|'|`)/);
    }
  });
});
