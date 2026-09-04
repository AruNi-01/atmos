import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentConfigFlyoutOffsetTop,
  agentConfigFlyoutSide,
  agentConfigTriggerText,
  initialAgentConfigFlyout,
} from "./prompt-input-view";

const promptInput = readFileSync(join(import.meta.dir, "./prompt-input.tsx"), "utf8");

describe("empty model list reload", () => {
  it("asks the host to reload when the model picker opens with no models", () => {
    expect(promptInput).toContain("onEmptyModelsOpen");
    expect(promptInput).toContain("if (next && models.length === 0)");
    expect(promptInput).toContain('if (next === "model" && models.length === 0)');
  });
});

describe("locked session config", () => {
  it("does not open the model flyout when models are locked", () => {
    expect(promptInput).toContain('if (next === "model" && modelsLocked) return');
    expect(promptInput).toContain("disabled={modelsLocked}");
    expect(promptInput).toContain("disabled={disabled || loading || modesLocked}");
    expect(promptInput).toContain("disabled={disabled || loading || permissionModesLocked}");
  });
});

describe("mode picker", () => {
  it("uses the agent/model MorphPopover instead of the motion Select", () => {
    const start = promptInput.indexOf("function PromptOptionSelect");
    const end = promptInput.indexOf("function PromptAgentConfigMenu");
    const selectFn = promptInput.slice(start, end);
    expect(selectFn).toContain("MorphPopover");
    expect(selectFn).toContain("ConfigFlyoutList");
    expect(selectFn).toContain("showSearch={showSearch}");
    expect(selectFn).toContain("options.length > 15");
    expect(selectFn).not.toContain("<Select");
    expect(selectFn).not.toContain("SelectTrigger");
  });
});

describe("permission picker", () => {
  it("reuses PromptOptionSelect instead of a second popover", () => {
    expect(promptInput).toContain("permissionModes.length");
    expect(promptInput).toContain("onPermissionModeChange");
    expect(promptInput).toContain("disabled={disabled || loading || permissionModesLocked}");
  });
});

describe("initialAgentConfigFlyout", () => {
  it("keeps the secondary menu closed until Agent or Model is hovered", () => {
    expect(
      initialAgentConfigFlyout({
        skipAgentList: false,
        agent: "cursor",
      }),
    ).toBeNull();
    expect(
      initialAgentConfigFlyout({
        skipAgentList: false,
        agent: "",
      }),
    ).toBeNull();
    expect(
      initialAgentConfigFlyout({
        skipAgentList: true,
        agent: "",
      }),
    ).toBeNull();
  });
});

describe("agentConfigFlyoutSide", () => {
  it("opens the submenu to the right when the viewport has room", () => {
    expect(
      agentConfigFlyoutSide({
        menuRight: 400,
        viewportWidth: 1200,
      }),
    ).toBe("right");
  });

  it("opens the submenu to the left when the right edge would overflow", () => {
    expect(
      agentConfigFlyoutSide({
        menuRight: 1100,
        viewportWidth: 1200,
      }),
    ).toBe("left");
  });
});

describe("agentConfigFlyoutOffsetTop", () => {
  it("keeps top alignment when the submenu fits below the primary menu", () => {
    expect(
      agentConfigFlyoutOffsetTop({
        menuTop: 200,
        flyoutHeight: 320,
        viewportHeight: 800,
      }),
    ).toBe(0);
  });

  it("shifts the submenu up when top alignment would clip the bottom", () => {
    expect(
      agentConfigFlyoutOffsetTop({
        menuTop: 500,
        flyoutHeight: 320,
        viewportHeight: 600,
      }),
    ).toBe(-228);
  });
});

describe("agentConfigTriggerText", () => {
  it("joins model and thinking with a middle dot", () => {
    expect(
      agentConfigTriggerText({
        modelLabel: "Grok 4.6",
        thinkingLabel: "X-High",
      }),
    ).toBe("Grok 4.6 · X-High");
  });

  it("falls back to the agent label when no model is selected", () => {
    expect(
      agentConfigTriggerText({
        agentLabel: "Grok",
      }),
    ).toBe("Grok");
  });

  it("omits the middle dot when thinking is empty", () => {
    expect(
      agentConfigTriggerText({
        modelLabel: "Grok 4.6",
        thinkingLabel: "",
      }),
    ).toBe("Grok 4.6");
  });
});

describe("S2 thinking control visibility", () => {
  it("shows the effort slider only when there are at least two levels", () => {
    expect(promptInput).toContain("thinkingLevels.length > 1");
    expect(promptInput).toContain("function ThinkingSliderPanel");
    expect(promptInput).toContain('variant="effort"');
  });
});

describe("PromptAgentConfigMenu", () => {
  it("keeps agent and model in a hover flyout and effort as an inline slider", () => {
    expect(promptInput).toContain("function PromptAgentConfigMenu");
    expect(promptInput).toContain("function ThinkingSliderPanel");
    expect(promptInput).not.toContain('flyout === "thinking"');
    expect(promptInput).toContain("openFlyout");
    expect(promptInput).toContain("{flyout ? (");
    expect(promptInput).toContain("clip={false}");
    expect(promptInput).toContain('flyoutSide === "right" ? "left-full pl-1.5" : "right-full pr-1.5"');
    expect(promptInput).not.toContain("PromptAgentModelSelect");
    expect(promptInput).not.toContain("initialAgentModelSelectView");
    expect(promptInput).not.toContain("border-t border-border/60");
  });

  it("searches models only, never agents", () => {
    expect(promptInput).toContain("searchPlaceholder={labels.searchModels}");
    expect(promptInput).not.toContain("searchPlaceholder={labels.searchAgents}");
  });
});
