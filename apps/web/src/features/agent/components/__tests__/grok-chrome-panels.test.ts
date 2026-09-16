import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const goalPanel = readFileSync(
  join(import.meta.dir, "../grok/GrokGoalPanel.tsx"),
  "utf8",
);
const workflowPanel = readFileSync(
  join(import.meta.dir, "../grok/GrokWorkflowPanel.tsx"),
  "utf8",
);
const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
  "utf8",
);
const overlay = readFileSync(
  join(import.meta.dir, "../SubagentConversationOverlay.tsx"),
  "utf8",
);

describe("grok chrome panels", () => {
  it("sits in the above-composer overlay lane and reuses the subagent overlay", () => {
    expect(composer).toContain("<GrokGoalPanel");
    expect(composer).toContain("<GrokWorkflowPanel");
    expect(composer).toContain('key="agent-grok-goal"');
    expect(composer).toContain('key="agent-grok-workflow"');
    const overlayAt = composer.indexOf("data-agent-chat-above-composer-overlays");
    const goalAt = composer.indexOf("<GrokGoalPanel");
    const workflowAt = composer.indexOf("<GrokWorkflowPanel");
    const subAt = composer.indexOf("<SubagentTasksPanel");
    const stackAt = composer.indexOf("data-agent-composer-upper-cards");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(goalAt).toBeGreaterThan(overlayAt);
    expect(workflowAt).toBeGreaterThan(goalAt);
    expect(subAt).toBeGreaterThan(workflowAt);
    expect(stackAt).toBeGreaterThan(subAt);
    expect(goalPanel).toContain("grokGoalPhaseSections");
    expect(workflowPanel).toContain("grokWorkflowPhaseSections");
    expect(goalPanel).toContain("data-agent-grok-goal-panel");
    expect(workflowPanel).toContain("data-agent-grok-workflow-panel");
    expect(composer).toContain("grokGoal.status !== \"cleared\"");
    expect(composer).toContain("grokWorkflow.status !== \"cleared\"");
    expect(overlay).toContain("messagesForSubagent");
  });
});
