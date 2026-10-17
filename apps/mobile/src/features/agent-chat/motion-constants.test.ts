// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  TREE_DRAW_MS,
  TREE_EASE,
  TREE_STAGGER_CAP_MS,
  TREE_STEP_MS,
  treeStaggerDelayMs,
} from "@atmos/agent-transcript/agent-tree-branch";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "../../../../..");

describe("motion constants", () => {
  test("match the shared web values", () => {
    expect(TREE_DRAW_MS).toBe(400);
    expect(TREE_STEP_MS).toBe(56);
    expect(TREE_STAGGER_CAP_MS).toBe(560);
    expect(TREE_EASE).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(treeStaggerDelayMs(0, 4)).toBe(0);
    expect(treeStaggerDelayMs(1, 3)).toBe(TREE_STEP_MS);
    expect(treeStaggerDelayMs(2, 21)).toBe(56);
  });

  test("web re-exports the package module and the phone uses those timings", () => {
    const web = readFileSync(
      join(workspace, "apps/web/src/features/agent/lib/agent-tree-branch.ts"),
      "utf8",
    );
    const tree = readFileSync(join(here, "tool-tree.tsx"), "utf8");
    const reveal = readFileSync(join(here, "motion/part-reveal.tsx"), "utf8");
    expect(web.trim()).toBe('export * from "@atmos/agent-transcript/agent-tree-branch";');
    expect(tree).toContain('from "@atmos/agent-transcript/agent-tree-branch"');
    expect(tree).toContain("duration: TREE_DRAW_MS");
    expect(tree).toContain("Easing.bezier(0.23, 1, 0.32, 1)");
    expect(reveal).toContain("duration: TREE_DRAW_MS");
    expect(reveal).toContain("Easing.bezier(0.23, 1, 0.32, 1)");
    expect(tree).not.toMatch(/const TREE_DRAW_MS\s*=/);
  });
});
