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

const ALLOW_ACP_ADAPTER = [
  "/hooks/use-agent-session.ts",
  "/lib/agent-runtime-socket.ts",
  "/lib/agent/thread/reducer.ts",
  "/lib/agent-chat-session-handoff.ts",
];

describe("S12 Agent Chat live path does not import ACP schema or classify vendors", () => {
  it("denies vendor ACP schema and session/list identity imports in host modules", () => {
    const files = walk(ROOT).filter((path) => {
      return !ALLOW_ACP_ADAPTER.some((suffix) => path.endsWith(suffix));
    });
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("agent-client-protocol");
      expect(source).not.toContain("acp_session_id");
      expect(source).not.toMatch(/["'`]\/ws\/agent(?:\/|"|'|`)/);
      expect(source).not.toContain("classifyTool(");
      expect(source).not.toContain("background-command/adapters");
      expect(source).not.toContain("commandFromProbe");
      expect(source).not.toContain("deriveToolDisplayName");
      expect(source).not.toContain("BackgroundToolProbe");
    }
  });
});
