import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countedRevealDelay,
  nextTreeRevealDelay,
  shouldPlayTreeTitleEnter,
  treeTitleRevealMs,
  TREE_CONTENT_DELAY_MS,
  TREE_LINE_MS,
  TREE_START_MS,
  TREE_TITLE_SEGMENT_MS,
  TREE_TITLE_STAGGER_MS,
  WEBSEARCH_EXPAND_MS,
  WEBSEARCH_STEP_MS,
} from "@/features/agent/lib/agent-tree-branch";

describe("nextTreeRevealDelay", () => {
  it("holds the first child so it does not land on the parent frame", () => {
    expect(nextTreeRevealDelay(0, 4)).toBe(TREE_START_MS);
  });

  it("waits for each elbow to finish, even when a large batch is pending", () => {
    expect(nextTreeRevealDelay(1, 3)).toBe(TREE_LINE_MS);
    expect(nextTreeRevealDelay(1, 9)).toBe(TREE_LINE_MS);
    expect(nextTreeRevealDelay(1, 17)).toBe(TREE_LINE_MS);
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

describe("agent tree wiring", () => {
  it("masks the elbow with an opaque background so the trunk cannot double-paint", () => {
    const branch = readFileSync(
      join(import.meta.dir, "../../components/AgentTreeBranch.tsx"),
      "utf8",
    );
    expect(branch).toContain("bg-background");
    expect(branch).toContain("border-border");
    expect(branch).toContain("z-[1]");
    expect(branch).toContain("linear-gradient(var(--border), var(--border))");
    expect(branch).not.toContain("bg-border");
  });

  it("reveals tools one at a time while streaming, drawing each elbow down then right", () => {
    const branch = readFileSync(
      join(import.meta.dir, "../../components/AgentTreeBranch.tsx"),
      "utf8",
    );
    const group = readFileSync(
      join(import.meta.dir, "../../components/AgentToolGroupView.tsx"),
      "utf8",
    );
    expect(branch).toContain("clipPath");
    expect(branch).toContain("el.animate");
    expect(branch).toContain('key="trunk"');
    expect(branch).toContain('key="elbow"');
    expect(branch).toContain("AgentStreamReveal");
    expect(group).toContain("useSequentialReveal");
    expect(group).toContain("parts.slice(0, shown)");
    expect(group).toContain("AgentTreeRevealProvider");
    expect(group).toContain("AgentToolDiffStats");
    expect(group).toContain("sumToolGroupDiffStats");
    expect(group).toContain("renderPart");
    const delays = readFileSync(
      join(import.meta.dir, "../agent-tree-branch.ts"),
      "utf8",
    );
    expect(delays).toContain("return TREE_LINE_MS");
    expect(delays).not.toContain("pending > 16");
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
