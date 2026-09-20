import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countedRevealDelay,
  nextTreeRevealDelay,
  shouldPlayTreeTitleEnter,
  treeElbowRadius,
  treeReachLength,
  treeReachPath,
  clampTreeShown,
  treeEnterDelayMs,
  nextTreeWatermark,
  treeSegmentDelayMs,
  treeStaggerDelayMs,
  treeTitleRevealMs,
  treeTrunkPath,
  TREE_BRANCH_END_X,
  TREE_BRANCH_RADIUS,
  TREE_BRANCH_TRUNK_X,
  TREE_CONTENT_DELAY_MS,
  TREE_DRAW_MS,
  TREE_LINE_MS,
  TREE_STAGGER_CAP_MS,
  TREE_START_MS,
  TREE_STEP_MS,
  TREE_TITLE_SEGMENT_MS,
  TREE_TITLE_STAGGER_MS,
  WEBSEARCH_EXPAND_MS,
  WEBSEARCH_STEP_MS,
} from "@/features/agent/lib/agent-tree-branch";

describe("nextTreeRevealDelay", () => {
  it("holds the first child so it does not land on the parent frame", () => {
    expect(nextTreeRevealDelay(0, 4)).toBe(TREE_START_MS);
  });

  it("starts the next stroke before the previous draw finishes", () => {
    expect(nextTreeRevealDelay(1, 3)).toBe(TREE_STEP_MS);
    expect(nextTreeRevealDelay(1, 9)).toBe(TREE_STEP_MS);
    expect(nextTreeRevealDelay(1, 17)).toBe(TREE_STEP_MS);
    expect(TREE_STEP_MS).toBeLessThan(TREE_DRAW_MS);
  });
});

describe("countedRevealDelay", () => {
  it("steps toward the target one item at a time", () => {
    expect(countedRevealDelay(0, 0, WEBSEARCH_STEP_MS)).toBeNull();
    expect(countedRevealDelay(0, 5, WEBSEARCH_STEP_MS)).toBe(16);
    expect(countedRevealDelay(2, 5, WEBSEARCH_STEP_MS)).toBe(WEBSEARCH_STEP_MS);
    expect(countedRevealDelay(5, 0, WEBSEARCH_STEP_MS)).toBe(WEBSEARCH_STEP_MS);
  });
});

describe("websearch expand timing", () => {
  it("keeps expand and collapse on the same clip duration", () => {
    expect(WEBSEARCH_EXPAND_MS).toBe(300);
  });
});

describe("tree reach geometry", () => {
  it("drops vertically, arcs, then arms to the row", () => {
    const path = treeReachPath(0, 24);
    expect(path).toContain(`M ${TREE_BRANCH_TRUNK_X} 0`);
    expect(path).toContain(`A ${TREE_BRANCH_RADIUS} ${TREE_BRANCH_RADIUS} 0 0 0`);
    expect(path).toContain(`H ${TREE_BRANCH_END_X}`);
    expect(treeElbowRadius(24, 0)).toBe(TREE_BRANCH_RADIUS);
    expect(treeElbowRadius(4, 0)).toBe(2);
    expect(treeReachLength(0, 24)).toBeGreaterThan(TREE_BRANCH_END_X - TREE_BRANCH_TRUNK_X);
  });

  it("only draws a trunk when there is room below the elbow", () => {
    expect(treeTrunkPath(12, 12)).toBe(`M ${TREE_BRANCH_TRUNK_X} 12`);
    expect(treeTrunkPath(12, 40)).toBe(`M ${TREE_BRANCH_TRUNK_X} 12 V 40`);
  });

  it("overlaps stroke starts without shortening the draw", () => {
    expect(treeSegmentDelayMs(0)).toBe(0);
    expect(treeSegmentDelayMs(1)).toBe(TREE_STEP_MS);
    expect(treeSegmentDelayMs(20)).toBe(20 * TREE_STEP_MS);
    expect(treeEnterDelayMs(0, 0, 5)).toBe(0);
    expect(treeEnterDelayMs(2, 0, 5)).toBe(2 * TREE_STEP_MS);
    expect(treeEnterDelayMs(2, 2, 3)).toBe(0);
    expect(treeEnterDelayMs(0, 0, 1)).toBe(0);
  });

  it("compresses the step so a long group still starts within the cap", () => {
    expect(treeStaggerDelayMs(4, 5)).toBe(4 * TREE_STEP_MS);
    expect(treeStaggerDelayMs(39, 40)).toBe(TREE_STAGGER_CAP_MS);
    expect(treeEnterDelayMs(39, 0, 40)).toBe(TREE_STAGGER_CAP_MS);
  });

  it("keeps already-seen rows still when the group is closed or reopened", () => {
    expect(nextTreeWatermark(2, 5, false)).toBe(5);
    expect(nextTreeWatermark(2, 5, true)).toBe(2);
    expect(nextTreeWatermark(4, 3, true)).toBe(3);
    expect(clampTreeShown(2, 5, 2, false)).toBe(5);
    expect(clampTreeShown(2, 5, 2, true)).toBe(2);
    expect(clampTreeShown(0, 5, 3, true)).toBe(3);
  });
});

describe("agent tree wiring", () => {
  it("draws rounded strokes instead of clipping a CSS elbow", () => {
    const branch = readFileSync(
      join(import.meta.dir, "../../components/AgentTreeBranch.tsx"),
      "utf8",
    );
    expect(branch).toContain("pathLength={1}");
    expect(branch).toContain("strokeDashoffset");
    expect(branch).toContain("treeReachPath");
    expect(branch).toContain('data-tree-stroke="trunk"');
    expect(branch).toContain('data-tree-stroke="elbow"');
    expect(branch).not.toContain("clipPath");
    expect(branch).not.toContain("el.animate");
    expect(branch).not.toContain("bg-background");
    expect(branch).not.toContain("linear-gradient(var(--border), var(--border))");
  });

  it("reveals tools one at a time while streaming, drawing the group from the parent down", () => {
    const group = readFileSync(
      join(import.meta.dir, "../../components/AgentToolGroupView.tsx"),
      "utf8",
    );
    // Only rows that arrive while the group is open animate; reopen stays instant.
    expect(group).toContain("useTreeRowReveal(parts.length, open)");
    expect(group).toContain("parts.slice(0, shown)");
    expect(group).toContain("AgentTreeRevealProvider");
    expect(group).toContain("AgentToolDiffStats");
    expect(group).toContain("sumToolGroupDiffStats");
    expect(group).toContain("renderPart");
    // Rows own their own strokes so layout, not a measured overlay, places them.
    expect(group).toContain("AgentTreeBranch");
    expect(group).toContain("animate={index >= watermark}");
    expect(group).toContain("treeEnterDelayMs");
    expect(group).not.toContain("AgentTreeNetwork");
    expect(group).not.toContain("ResizeObserver");
    expect(group).not.toContain('data-tree-row=""');
    expect(group).not.toContain("animate={open}");
    expect(group).not.toContain("animate={streaming}");
    expect(group).not.toContain("useSequentialReveal(parts.length, streaming)");
    expect(group).not.toContain("useSequentialReveal(parts.length, autoOpen)");
    const delays = readFileSync(
      join(import.meta.dir, "../agent-tree-branch.ts"),
      "utf8",
    );
    expect(delays).toContain("return TREE_STEP_MS");
    expect(delays).not.toContain("pending > 16");
    expect(TREE_LINE_MS).toBe(TREE_DRAW_MS);
    const reveal = readFileSync(
      join(import.meta.dir, "../../components/AgentStreamReveal.tsx"),
      "utf8",
    );
    expect(reveal).toContain("TREE_REVEAL_BLUR");
    expect(reveal).toContain("TREE_REVEAL_LIFT");
    expect(reveal).toContain("--agent-reveal-fade");
    expect(reveal).toContain("maskImage");
  });

  it("clips websearch sources as one height group while marks share layout", () => {
    const body = readFileSync(
      join(import.meta.dir, "../../components/tool-results/AgentToolBodies.tsx"),
      "utf8",
    );
    expect(body).toContain("WEBSEARCH_EXPAND_MS");
    expect(body).toContain("data-websearch-list");
    expect(body).toContain("data-websearch-stack");
    expect(body).toContain("grid-template-rows");
    expect(body).toContain("grid-template-columns");
    expect(body).toContain("layoutId");
    expect(body).toContain("inert={!open ? true : undefined}");
    expect(body).toContain("animate={open}");
    expect(body).not.toContain("useCountedReveal");
    expect(body).not.toContain("stackedRemaining");
    expect(body).not.toContain("WEBSEARCH_LINE_MS");
  });

  it("keeps tool titles static when idle; shimmer only while running", () => {
    const card = readFileSync(
      join(import.meta.dir, "../../components/tool-results/AgentToolCard.tsx"),
      "utf8",
    );
    const reveal = readFileSync(
      join(import.meta.dir, "../../components/AgentStreamReveal.tsx"),
      "utf8",
    );
    const view = readFileSync(
      join(import.meta.dir, "../../components/AssistantMessageView.tsx"),
      "utf8",
    );
    expect(card).toContain("TextShimmer");
    expect(card).toContain("showShimmer");
    expect(card).not.toContain("TextEffect");
    expect(card).not.toContain("AgentTreeTitle");
    expect(card).not.toContain("shouldPlayTreeTitleEnter");
    expect(card).toContain("useAgentTreeReveal");
    expect(reveal).not.toContain("if (done) return <>{children}</>");
    expect(view).not.toContain("<AgentStreamReveal key={key} enabled={streaming}>");
  });
});

describe("treeTitleRevealMs", () => {
  it("waits for delay, stagger, and segment duration before swapping to static text", () => {
    expect(treeTitleRevealMs(10)).toBe(
      TREE_CONTENT_DELAY_MS + 10 * TREE_TITLE_STAGGER_MS + TREE_TITLE_SEGMENT_MS,
    );
  });
});

describe("shouldPlayTreeTitleEnter", () => {
  it("plays once on enter, never after shimmer or a previous show", () => {
    expect(shouldPlayTreeTitleEnter(true, false, false)).toBe(true);
    expect(shouldPlayTreeTitleEnter(true, true, false)).toBe(false);
    expect(shouldPlayTreeTitleEnter(true, false, true)).toBe(false);
    expect(shouldPlayTreeTitleEnter(false, false, false)).toBe(false);
  });
});
