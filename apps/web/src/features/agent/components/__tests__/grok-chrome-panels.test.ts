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
const overlays = readFileSync(
  join(import.meta.dir, "../AgentChatAboveComposerOverlays.tsx"),
  "utf8",
);
const overlay = readFileSync(
  join(import.meta.dir, "../SubagentConversationOverlay.tsx"),
  "utf8",
);
const roster = readFileSync(
  join(import.meta.dir, "../grok/GrokChromeRoster.tsx"),
  "utf8",
);

describe("grok chrome panels", () => {
  it("sits in the above-composer overlay lane and reuses the subagent overlay", () => {
    expect(composer).toContain("<AgentChatAboveComposerOverlays");
    expect(composer).toContain("grokGoal={grokGoal}");
    expect(composer).toContain("grokWorkflow={grokWorkflow}");
    expect(overlays).toContain("<GrokGoalPanel");
    expect(overlays).toContain("<GrokWorkflowPanel");
    expect(overlays).toContain('key="agent-grok-goal"');
    expect(overlays).toContain('key="agent-grok-workflow"');
    const overlayAt = overlays.indexOf("data-agent-chat-above-composer-overlays");
    const goalAt = overlays.indexOf("<GrokGoalPanel");
    const workflowAt = overlays.indexOf("<GrokWorkflowPanel");
    const subAt = overlays.indexOf("<SubagentTasksPanel");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(goalAt).toBeGreaterThan(overlayAt);
    expect(workflowAt).toBeGreaterThan(goalAt);
    expect(subAt).toBeGreaterThan(workflowAt);
    expect(composer).toContain("data-agent-composer-upper-cards");
    expect(goalPanel).toContain("grokGoalPhaseSections");
    expect(goalPanel).toContain("phases.${section.id}");
    expect(goalPanel).toContain("defaultOpen = true");
    expect(workflowPanel).toContain("defaultOpen = true");
    expect(roster).toContain("ChevronRight");
    expect(workflowPanel).toContain("grokWorkflowPhaseSections");
    expect(goalPanel).toContain("icon={Goal}");
    expect(goalPanel).not.toContain("icon={Flag}");
    expect(goalPanel).toContain("data-agent-grok-goal-panel");
    expect(goalPanel).toContain("data-agent-grok-goal-status");
    expect(goalPanel).toContain('className="mb-2 flex items-center gap-2 px-1 text-xs leading-5 text-muted-foreground"');
    expect(goalPanel).toContain('className="ml-auto shrink-0 whitespace-nowrap"');
    expect(goalPanel).not.toContain("space-y-0.5 px-1");
    expect(goalPanel).toContain("<PlanBlockView");
    expect(overlays).toContain("plan={currentPlan}");
    expect(composer).toContain("currentPlan && !showGrokGoalCard");
    expect(workflowPanel).toContain("data-agent-grok-workflow-panel");
    expect(overlays).toContain("grokGoal.status !== \"cleared\"");
    expect(overlays).toContain("grokWorkflow.status !== \"cleared\"");
    expect(overlays).toContain("OVERLAY_CARD_MAX_HEIGHT_CLASS");
    expect(overlays).toContain("OVERLAY_CARD_MAX_HEIGHT_VAR");
    expect(overlays).toContain("capOverlayLane");
    expect(overlays).toContain("showGrokGoalCard");
    expect(goalPanel).toContain("overflow-y-auto overscroll-contain");
    expect(workflowPanel).toContain("overflow-y-auto overscroll-contain");
    expect(overlay).toContain("messagesForSubagent");
  });
});
