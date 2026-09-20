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
const overlays = readFileSync(
  join(import.meta.dir, "../AgentChatAboveComposerOverlays.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(import.meta.dir, "../AgentChatPanel.tsx"),
  "utf8",
);
const overlay = readFileSync(
  join(import.meta.dir, "../SubagentConversationOverlay.tsx"),
  "utf8",
);
const session = readFileSync(
  join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
  "utf8",
);
const messageView = readFileSync(
  join(import.meta.dir, "../AgentChatMessageView.tsx"),
  "utf8",
);
const list = readFileSync(
  join(import.meta.dir, "../AgentChatTranscriptList.tsx"),
  "utf8",
);
const hostDetail = readFileSync(
  join(import.meta.dir, "../../../agent-sessions/components/HostSessionDetailView.tsx"),
  "utf8",
);

describe("subagent tasks panel", () => {
  it("floats in the context-usage overlay lane, not the plan/queue stack", () => {
    expect(composer).toContain("<AgentChatAboveComposerOverlays");
    expect(overlays).toContain("<SubagentTasksPanel");
    expect(overlays).toContain("showSubagentTasksCard");
    expect(overlays).toContain('key="agent-subagent-tasks"');
    expect(composer).not.toContain("<SubagentTasksDock");
    const overlayAt = overlays.indexOf("data-agent-chat-above-composer-overlays");
    const panelAt = overlays.indexOf("<SubagentTasksPanel");
    const stackAt = composer.indexOf("data-agent-composer-upper-cards");
    const queueAt = composer.indexOf("<MessageQueueDock");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(overlayAt);
    expect(stackAt).toBeGreaterThan(-1);
    expect(queueAt).toBeGreaterThan(stackAt);
    expect(composer).toContain("currentPlan && !showGrokGoalCard");
    expect(composer).not.toContain("|| hasSubagentTasks\n    || hasBackgroundTools");
  });

  it("uses a matrix orb while running and opens the shared overlay", () => {
    expect(dock).toContain("flex min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-border bg-background p-3 shadow-none");
    expect(dock).toContain("data-agent-subagent-tasks-panel");
    expect(dock).toContain("overflow-y-auto overscroll-contain");
    expect(dock).toContain("ComposerCollapseGlyph");
    expect(dock).toContain("BotMessageSquare");
    expect(dock).toContain("collapsed={!isOpen}");
    expect(dock).not.toContain("ChevronDown");
    expect(dock).toContain("MatrixOrb");
    expect(dock).toContain('state={status === "running" ? "thinking" : "idle"}');
    expect(dock).toContain("seed={seed}");
    expect(dock).toContain("seed={part.tool_call_id}");
    expect(dock).not.toContain('style="S1"');
    expect(dock).not.toContain("<ActivityIndicator");
    expect(dock).toContain("formatSubagentTaskLine");
    expect(dock).toContain("subagentChildActivity");
    expect(dock).toContain("AgentActivityStatusText");
    expect(dock).toContain("activity={activity}");
    expect(dock).toContain("flex min-w-0 flex-1 items-center gap-1.5");
    expect(dock).toContain("min-w-0 shrink-0 text-muted-foreground");
    expect(dock).not.toContain("className=\"min-w-0 flex-1 text-muted-foreground\"");
    expect(dock).not.toContain("TextShimmer");
    expect(dock).not.toContain("activity.label");
    expect(dock).toContain("useSubagentOverlay");
    expect(dock).not.toContain("<SubAgentBlockBody");
    expect(dock).not.toContain("PopoverContent");
    expect(dock).not.toContain("data-agent-composer-upper-cards");
  });

  it("covers the tasks card with a column-capped detail overlay", () => {
    expect(overlays).toContain('data-agent-subagent-overlay=""');
    expect(overlays).toContain("subagentOverlayFrameHeight");
    expect(overlays).toContain('closest("[data-agent-chat-column]")');
    expect(overlays).toContain('closest("[data-agent-chat-composer]")');
    expect(overlays).toContain("const overlayOpen = Boolean(subagentOverlay)");
    expect(overlays).toContain("new ResizeObserver(apply)");
    expect(overlays).toContain("if (lane.style.height !== next) lane.style.height = next");
    expect(overlays).toContain("}, [capOverlayLane, composerSurfaceRef, laneNode, overlayOpen]");
    expect(overlays).toContain("capOverlayLane");
    expect(overlays).toContain("OVERLAY_CARD_MAX_HEIGHT_VAR");
    expect(overlays).toContain("OVERLAY_CARD_MAX_HEIGHT_CLASS");
    expect(overlays).toContain('capOverlayLane && "overflow-hidden"');
    expect(overlays).not.toContain("}, [subagentOverlay]");
    expect(overlays).toContain('subagentOverlay && "h-full min-h-0 flex-1 overflow-hidden"');
    expect(overlays).toContain("pointer-events-auto relative z-30 flex h-full min-h-0 min-w-0 w-full flex-1 select-text flex-col overflow-hidden");
    expect(overlays).not.toContain("h-[70cqh] max-h-[70cqh]");
    expect(overlays).not.toContain("h-[80cqh] max-h-[80cqh]");
    expect(overlays).not.toContain("max-h-[min(70cqh,calc(100cqh-100%-0.5rem))]");
    expect(overlays).not.toContain("max-h-[40%] overflow-y-auto");
    expect(overlays).toContain('key="agent-subagent-tasks"');
    expect(overlays).toContain('className={subagentOverlay ? "hidden" : undefined}');
    expect(overlay).toContain("AgentChatMessageView");
    expect(overlay).toContain("<AgentActivityIndicator");
    expect(overlay).toContain("elapsedMs");
    expect(overlay).toContain('className="mx-auto mt-2 w-[calc(100%-1rem)]"');
    expect(overlay).toContain("formatSubagentTaskLine");
    expect(overlay).toContain('className="flex h-full min-h-0 w-full min-w-0 flex-1 select-text flex-col overflow-hidden rounded-3xl border border-border bg-background"');
    expect(overlay).toContain("key={toolCallId}");
    expect(overlay).toContain("initial={false}");
    expect(overlay).toContain('resize="instant"');
    expect(overlay).toContain('className="min-h-0 h-full w-full min-w-0 flex-1 overflow-hidden"');
    expect(overlay).toContain('data-canvas-selectable-text="true"');
    expect(overlay).toContain('className={cn("w-full min-w-0 gap-3 px-3 py-4")}');
    expect(overlay).toContain('scrollClassName="h-full min-h-0 w-full min-w-0 overflow-y-auto"');
    expect(overlay).toContain('<div key={message.id} className="w-full min-w-0">');
    expect(overlay).not.toContain("statusLabel");
    expect(overlay).not.toContain("shrink-0 px-4 py-2");
    expect(panel).toContain("selectedSubagentId");
    expect(panel).toContain("<SubagentOverlayProvider");
    expect(panel).toContain("<SubagentConversationOverlay");
    expect(panel).toContain("elapsedMs={elapsedMs}");
  });

  it("collects current-turn subagents from the live session messages", () => {
    expect(session).toContain("excludeIds: grokChromeIds");
    expect(session).toContain("currentTurnSubagentTasks(messages, {");
    expect(session).toContain("subagentTasks");
    expect(panel).toContain("subagentTasks={subagentTasks}");
    expect(panel).toContain('subagentCardMode="live"');
    expect(list).toContain("inlineSubagentTasksByMessageId");
    expect(list).toContain("inlineSubagentTools={inlineSubagentTools.get(message.id)}");
    expect(messageView).toContain("<SubagentTasksPanel");
    expect(hostDetail).toContain('subagentCardMode="transcript"');
    expect(hostDetail).toContain("subagentTasks={{ items: [], tools: [] }}");
    expect(hostDetail).not.toContain("currentTurnSubagentTasks");
  });
});
