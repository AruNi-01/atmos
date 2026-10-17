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
import {
  LOG_ROW_ELBOW_DELAY_MS,
  LOG_ROW_ELBOW_MS,
  LOG_ROW_REVEAL_HEIGHT_MS,
  LOG_ROW_REVEAL_MS,
  LOG_ROW_TRUNK_MS,
  logRowElbowDelayMs,
} from "./motion/log-row-motion";

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

  test("web re-exports the package module; live tool groups use LogRow timings", () => {
    const web = readFileSync(
      join(workspace, "apps/web/src/features/agent/lib/agent-tree-branch.ts"),
      "utf8",
    );
    const log = readFileSync(
      join(workspace, "apps/web/src/features/agent/components/boardui/agent-log.tsx"),
      "utf8",
    );
    const tree = readFileSync(join(here, "tool-tree.tsx"), "utf8");
    const reveal = readFileSync(join(here, "motion/part-reveal.tsx"), "utf8");
    expect(web.trim()).toBe('export * from "@atmos/agent-transcript/agent-tree-branch";');
    expect(tree).toContain('from "@atmos/agent-transcript/agent-tree-branch"');
    expect(tree).toContain("duration={LOG_ROW_ELBOW_MS}");
    expect(tree).toContain("duration={LOG_ROW_TRUNK_MS}");
    expect(tree).toContain("Easing.linear");
    expect(reveal).toContain("LOG_ROW_REVEAL_HEIGHT_MS");
    expect(reveal).toContain("LOG_ROW_REVEAL_MS");
    expect(reveal).toContain(
      "Easing.bezier(LOG_ROW_EASE[0], LOG_ROW_EASE[1], LOG_ROW_EASE[2], LOG_ROW_EASE[3])",
    );
    expect(tree).not.toMatch(/const TREE_DRAW_MS\s*=/);
    expect(log).toContain("duration: 0.14");
    expect(log).toContain("duration: 0.12");
    expect(log).toContain("height: { duration: 0.38");
    expect(log).toContain("opacity: { duration: 0.42");
    expect(LOG_ROW_ELBOW_MS).toBe(140);
    expect(LOG_ROW_ELBOW_DELAY_MS).toBe(120);
    expect(LOG_ROW_TRUNK_MS).toBe(120);
    expect(LOG_ROW_REVEAL_HEIGHT_MS).toBe(380);
    expect(LOG_ROW_REVEAL_MS).toBe(420);
    expect(logRowElbowDelayMs(true)).toBe(0);
    expect(logRowElbowDelayMs(false)).toBe(120);
  });
});
