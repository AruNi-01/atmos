// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { copy } from "./copy";

type ChatPanelCopy = {
  scrollBelow: { prefix: string; suffix: string; unit: string };
  permissionRequested: string;
  askUserTitle: string;
  planApprovalTitle: string;
  sessionOpRequested: string;
  bottom: string;
  copy: { message: string };
  thinking: string;
  thoughtFor: string;
  thoughtForFew: string;
  workedFor: string;
  session: {
    creating: string;
    created: string;
    createdIn: string;
    createFailed: string;
    resuming: string;
    resumed: string;
    resumedIn: string;
    resumeFailed: string;
    switchedModel: string;
    switchedModelFrom: string;
    switchedMode: string;
    switchedModeFrom: string;
    switchedBoth: string;
    hints: {
      modelSwitchFailed: string;
      modeSwitchFailed: string;
      sessionOpFailed: string;
    };
  };
};

type AgentComponents = {
  chatPanel: ChatPanelCopy;
  assistantTurn: {
    process: { label: string; collapseLabel: string };
    files: { changed: string; showMore: string; showLess: string };
  };
  subAgent: { status: { running: string; failed: string; completed: string } };
  usageBadges: {
    turn: {
      title: string;
      input: string;
      output: string;
      thought: string;
      cacheRead: string;
      cacheWrite: string;
      total: string;
    };
  };
  plan: { title: string };
  messageQueue: { title: string };
  backgroundCommands: { title: string };
  subagentTasks: { title: string };
  grokGoal: { title: string };
  grokWorkflow: { title: string };
  contextWindow: { title: string };
};

const en = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../../web/messages/en.json"),
    "utf8",
  ),
) as { Agent: { components: AgentComponents } };

const components = en.Agent.components;
const chatPanel = components.chatPanel;

describe("agent chat copy parity", () => {
  test("scroll-below prefix, suffix, and unit match web copy", () => {
    expect(copy.scrollBelowPrefix).toBe(chatPanel.scrollBelow.prefix);
    expect(copy.scrollBelowPrefix).toBe("");
    expect(copy.scrollBelowSuffix).toBe(chatPanel.scrollBelow.suffix);
    expect(copy.scrollBelowSuffix).toBe("below");
    expect(copy.scrollBelowUnit).toBe(chatPanel.scrollBelow.unit);
    expect(copy.scrollBelowUnit).toContain("message");
  });

  test("card and panel titles match web copy", () => {
    expect(copy.permissionRequested).toBe(chatPanel.permissionRequested);
    expect(copy.askUserTitle).toBe(chatPanel.askUserTitle);
    expect(copy.planApprovalTitle).toBe(chatPanel.planApprovalTitle);
    expect(copy.sessionOpRequested).toBe(chatPanel.sessionOpRequested);
    expect(copy.bottom).toBe(chatPanel.bottom);
    expect(copy.planTitle).toBe(components.plan.title);
    expect(copy.messageQueueTitle).toBe(components.messageQueue.title);
    expect(copy.backgroundCommandsTitle).toBe(components.backgroundCommands.title);
    expect(copy.subagentTasksTitle).toBe(components.subagentTasks.title);
    expect(copy.grokGoalTitle).toBe(components.grokGoal.title);
    expect(copy.grokWorkflowTitle).toBe(components.grokWorkflow.title);
    expect(copy.grokWorkflowTitle).toBe("Research");
    expect(copy.contextWindowTitle).toBe(components.contextWindow.title);
  });

  test("transcript chrome strings match web copy", () => {
    expect(copy.copyMessage).toBe(chatPanel.copy.message);
    expect(copy.copyMessage).toBe("Copy message");
    expect(copy.thinkingStream).toBe(chatPanel.thinking);
    expect(copy.thinkingStream).toBe("Thinking...");
    expect(copy.thoughtFor).toBe(chatPanel.thoughtFor);
    expect(copy.thoughtForFew).toBe(chatPanel.thoughtForFew);
    expect(copy.thoughtForFew).toBe("Thought for a few seconds");
    expect(copy.workedFor).toBe(chatPanel.workedFor);
    expect(copy.session.creating).toBe(chatPanel.session.creating);
    expect(copy.session.created).toBe(chatPanel.session.created);
    expect(copy.session.createdIn).toBe(chatPanel.session.createdIn);
    expect(copy.session.createFailed).toBe(chatPanel.session.createFailed);
    expect(copy.session.resuming).toBe(chatPanel.session.resuming);
    expect(copy.session.resumed).toBe(chatPanel.session.resumed);
    expect(copy.session.resumedIn).toBe(chatPanel.session.resumedIn);
    expect(copy.session.resumeFailed).toBe(chatPanel.session.resumeFailed);
    expect(copy.session.switchedModel).toBe(chatPanel.session.switchedModel);
    expect(copy.session.switchedModelFrom).toBe(chatPanel.session.switchedModelFrom);
    expect(copy.session.switchedMode).toBe(chatPanel.session.switchedMode);
    expect(copy.session.switchedModeFrom).toBe(chatPanel.session.switchedModeFrom);
    expect(copy.session.switchedBoth).toBe(chatPanel.session.switchedBoth);
    expect(copy.session.hints.modelSwitchFailed).toBe(chatPanel.session.hints.modelSwitchFailed);
    expect(copy.session.hints.modeSwitchFailed).toBe(chatPanel.session.hints.modeSwitchFailed);
    expect(copy.session.hints.sessionOpFailed).toBe(chatPanel.session.hints.sessionOpFailed);
    expect(copy.processLabel).toBe(components.assistantTurn.process.label);
    expect(copy.processLabel).toBe("Process");
    expect(copy.collapseLabel).toBe(components.assistantTurn.process.collapseLabel);
    expect(copy.collapseLabel).toBe("Collapse");
    expect(copy.showLess).toBe(components.assistantTurn.files.showLess);
    expect(copy.showLess).toBe("Show less");
    expect(copy.showMore).toBe("Show more");
    expect(copy.subagentStatus.running).toBe(components.subAgent.status.running);
    expect(copy.subagentStatus.failed).toBe(components.subAgent.status.failed);
    expect(copy.subagentStatus.completed).toBe(components.subAgent.status.completed);
    expect(copy.filesChanged).toBe(components.assistantTurn.files.changed);
    expect(copy.filesShowMore).toBe(components.assistantTurn.files.showMore);
    expect(copy.filesShowLess).toBe(components.assistantTurn.files.showLess);
    expect(copy.usageTurn.title).toBe(components.usageBadges.turn.title);
    expect(copy.usageTurn.input).toBe(components.usageBadges.turn.input);
    expect(copy.usageTurn.output).toBe(components.usageBadges.turn.output);
    expect(copy.usageTurn.thought).toBe(components.usageBadges.turn.thought);
    expect(copy.usageTurn.cacheRead).toBe(components.usageBadges.turn.cacheRead);
    expect(copy.usageTurn.cacheWrite).toBe(components.usageBadges.turn.cacheWrite);
    expect(copy.usageTurn.total).toBe(components.usageBadges.turn.total);
  });
});
