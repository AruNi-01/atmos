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
};

type AgentComponents = {
  chatPanel: ChatPanelCopy;
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
});
