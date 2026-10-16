// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { existsSync, readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

describe("shared chat rules", () => {
  test("the phone copies of the rule modules are gone", () => {
    expect(existsSync(join(here, "assistant-process.ts"))).toBe(false);
    expect(existsSync(join(here, "event-model.ts"))).toBe(false);
    expect(existsSync(join(here, "AgentChatDetailSheet.tsx"))).toBe(false);
  });

  test("segmentation and motion constants resolve to the package", () => {
    const sources = sourceFiles(here).map((path) => readFileSync(path, "utf8"));
    const combined = sources.join("\n");
    expect(combined).not.toMatch(/function segmentAssistantParts/);
    expect(combined).not.toMatch(/function countMessagesBelowViewport/);
    expect(combined).not.toMatch(/export const TREE_DRAW_MS/);
    expect(combined).toContain('from "@atmos/agent-transcript"');
    expect(combined).toContain('from "@atmos/agent-transcript/agent-tree-branch"');
  });
});
