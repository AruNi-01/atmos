import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  nextTreeRevealDelay,
  shouldPlayTreeTitleEnter,
  treeTitleRevealMs,
  TREE_CONTENT_DELAY_MS,
  TREE_START_MS,
  TREE_STEP_MS,
  TREE_TITLE_SEGMENT_MS,
  TREE_TITLE_STAGGER_MS,
} from "@/features/agent/lib/agent-tree-branch";

describe("nextTreeRevealDelay", () => {
  it("holds the first child so it does not land on the parent frame", () => {
    expect(nextTreeRevealDelay(0, 4)).toBe(TREE_START_MS);
  });

  it("paces later children, and catches up when a large batch is pending", () => {
    expect(nextTreeRevealDelay(1, 3)).toBe(TREE_STEP_MS);
    expect(nextTreeRevealDelay(1, 9)).toBe(50);
    expect(nextTreeRevealDelay(1, 17)).toBe(24);
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
    expect(group).toContain("useSequentialReveal");
    expect(group).toContain("parts.slice(0, shown)");
    expect(group).toContain("AgentTreeRevealProvider");
    expect(group).toContain("AgentToolDiffStats");
    expect(group).toContain("sumToolGroupDiffStats");
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
