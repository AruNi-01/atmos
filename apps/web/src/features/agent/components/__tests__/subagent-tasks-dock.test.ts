import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dock = readFileSync(
  join(import.meta.dir, "../SubagentTasksDock.tsx"),
  "utf8",
);
const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(import.meta.dir, "../AgentChatPanel.tsx"),
  "utf8",
);
const session = readFileSync(
  join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
  "utf8",
);

describe("subagent tasks panel", () => {
  it("floats in the context-usage overlay lane, not the plan/queue stack", () => {
    expect(composer).toContain("<SubagentTasksPanel");
    expect(composer).toContain("showSubagentTasksCard");
    expect(composer).toContain('key="agent-subagent-tasks"');
    expect(composer).not.toContain("<SubagentTasksDock");
    const overlayAt = composer.indexOf("data-agent-chat-above-composer-overlays");
    const panelAt = composer.indexOf("<SubagentTasksPanel");
    const stackAt = composer.indexOf("data-agent-composer-upper-cards");
    const queueAt = composer.indexOf("<MessageQueueDock");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(overlayAt);
    expect(stackAt).toBeGreaterThan(panelAt);
    expect(queueAt).toBeGreaterThan(stackAt);
    expect(composer).toContain(
      "Boolean(currentPlan)\n    || hasBackgroundTools\n    || hasQueuedPrompts",
    );
    expect(composer).not.toContain("|| hasSubagentTasks\n    || hasBackgroundTools");
  });

  it("uses the context-usage card chrome and only adds collapse", () => {
    expect(dock).toContain("w-full rounded-3xl border border-border bg-background p-3 shadow-none");
    expect(dock).toContain("data-agent-subagent-tasks-panel");
    expect(dock).toContain("Collapsible");
    expect(dock).toContain("ChevronDown");
    expect(dock).toContain('style="S1"');
    expect(dock).toContain("formatSubagentTaskLine");
    expect(dock).toContain("<SubAgentBlockBody");
    expect(dock).not.toContain("ComposerCollapseGlyph");
    expect(dock).not.toContain("PopoverContent");
    expect(dock).not.toContain("data-agent-composer-upper-cards");
  });

  it("collects current-turn subagents from the live session messages", () => {
    expect(session).toContain("currentTurnSubagentTasks(messages)");
    expect(session).toContain("subagentTasks");
    expect(panel).toContain("subagentTasks={subagentTasks}");
  });
});
