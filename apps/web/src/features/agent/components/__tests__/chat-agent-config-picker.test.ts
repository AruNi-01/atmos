import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { automationChatAgentConfig } from "@/features/automations/lib/automation-chat-config";

const setup = readFileSync(
  join(import.meta.dir, "../../../automations/components/AutomationSetup.tsx"),
  "utf8",
);
const selector = readFileSync(
  join(import.meta.dir, "../TerminalAgentSelectorWithRunConfig.tsx"),
  "utf8",
);

describe("automation chat agent picker", () => {
  it("reuses ChatAgentConfigInput for chat and WelcomeAgentSelector for CLI modes", () => {
    expect(setup).toContain("WelcomeAgentSelector");
    expect(setup).toContain("ChatAgentConfigInput");
    expect(setup).toContain("configOnly");
    expect(setup).toContain("menuInline");
    expect(setup).not.toContain("ChatAgentConfigPicker");
    expect(setup).not.toContain("ChatAgentPicker");
    expect(setup).toContain("automationChatAgentConfig(agentId,");
    expect(setup).toContain("permissionOption={null}");
    expect(setup).toContain("modeOption={null}");
  });

  it("persists YOLO for unattended chat runs", () => {
    expect(automationChatAgentConfig("claude")).toEqual({
      kind: "chat",
      provider_id: "claude",
      permission_mode: "yolo",
    });
    expect(automationChatAgentConfig("claude", { model: "opus" })).toEqual({
      kind: "chat",
      provider_id: "claude",
      permission_mode: "yolo",
      model: "opus",
    });
  });
});

describe("automation execute-agent panel rows", () => {
  it("keeps welcome and panel agent rows without a card fill", () => {
    expect(selector).toContain(
      '"group/agent flex items-center gap-1.5 rounded-md px-2 py-1"',
    );
    expect(selector).toContain('disabledReason ? "opacity-60" : "hover:bg-accent/70"');
    expect(selector).not.toContain('props.variant !== "panel" && "bg-background"');
    expect(selector).not.toContain("selected && \"bg-muted\"");
  });
});
