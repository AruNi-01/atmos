import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { automationChatAgentConfig } from "@/features/automations/lib/automation-chat-config";
import {
  pointerDownKeepsTerminalPickerOpen,
  terminalPickerClosesOnModelChoice,
} from "@/features/agent/lib/terminal-picker-dismiss";

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
  it("mounts the shared model popover and passes headless disabled reasons through", () => {
    expect(selector).toContain("TerminalAgentModelPopover");
    expect(selector).toContain("menuInline");
    expect(selector).toContain("runConfigFor={getRunConfig}");
    expect(selector).toContain("openRunConfig");
    expect(selector).toContain("onOpenAgentList");
    expect(selector).toContain("border-0 bg-transparent p-0 shadow-none");
    expect(selector).toContain("agentLocked={pickerLocked}");
    expect(selector).toContain("configureAgent");
    expect(selector).not.toContain('props.variant !== "panel" && "bg-background"');
    expect(selector).not.toContain('selected && "bg-muted"');
    const popover = readFileSync(join(import.meta.dir, "../TerminalAgentModelPopover.tsx"), "utf8");
    expect(popover).toContain("terminalModelCatalogEnabled");
    expect(popover).toContain("onExtraArgsChange={");
    expect(popover).toContain("terminalFastVisible");
    expect(popover).toContain("onFastChange={applyFast}");
    expect(popover).toContain("contextLevels={[]}");
    expect(popover).toContain("disabledReason");
    expect(popover).toContain('wsRequest("terminal_agent_prefs_get"');
    expect(popover).toContain('wsRequest("terminal_agent_prefs_set"');
    expect(popover).not.toContain("rememberFavoriteModels");
    expect(popover).toContain("title={hint}");
    expect(popover).toContain("if (agentLocked && value !== agentId) return");
    expect(popover).toContain("setFavoritesOpen(false)");
    expect(popover).not.toContain("if (reason || agentLocked) return");
    expect(popover).toContain("if (agentLocked && target !== agentId) return");
    expect(popover).toContain("hydratedAgents");
    expect(popover).toContain("if (!hydrateLastPick) return");
    expect(popover).toContain("current?.extra_args?.length");
    expect(popover).toContain("if (!prefs) return");
    expect(popover).toContain("prefsEpoch");
    expect(popover).not.toContain("catalogEnabled && !favoritesOpen");
    expect(terminalPickerClosesOnModelChoice()).toBe(false);
    const portal = {
      closest: (selector: string) => (selector === "[data-morph-popover-portal]" ? portal : null),
    };
    const outside = { closest: () => null };
    expect(pointerDownKeepsTerminalPickerOpen(portal)).toBe(true);
    expect(pointerDownKeepsTerminalPickerOpen(outside)).toBe(false);
    expect(pointerDownKeepsTerminalPickerOpen(null)).toBe(false);
    const modelChoice = selector.slice(
      selector.indexOf("onModelChosen="),
      selector.indexOf("menuInline"),
    );
    expect(modelChoice).toContain(
      'if (terminalPickerClosesOnModelChoice() && props.variant !== "panel") setOpen(false)',
    );
    expect(selector).toContain("onOpenChange={setOpen}");
    expect(selector).toContain("pointerDownKeepsTerminalPickerOpen");
    expect(selector).toContain('if (props.variant !== "panel") setOpen(false)');
    const overlay = readFileSync(
      join(import.meta.dir, "../../../terminal/components/TerminalAgentInputOverlay.tsx"),
      "utf8",
    );
    expect(overlay).toContain("sideChatRunConfigsRef.current = next");
    expect(overlay).toContain("sideChatRunConfigsRef.current[agentId]");
  });
});
