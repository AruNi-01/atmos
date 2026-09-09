import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentConfigFlyoutOffsetTop,
  agentConfigFlyoutSide,
  agentConfigTriggerText,
  modelEffortTriggerLabel,
} from "./prompt-input-view";

const promptInput = readFileSync(join(import.meta.dir, "./prompt-input.tsx"), "utf8");

describe("empty model list reload", () => {
  it("asks the host to reload when the model picker opens with no models", () => {
    expect(promptInput).toContain("onEmptyModelsOpen");
    expect(promptInput).toContain("if (next && models.length === 0)");
  });
});

describe("locked session config", () => {
  it("does not select a different model when models are locked", () => {
    expect(promptInput).toContain("disabled={option.disabled || modelsLocked}");
    expect(promptInput).toContain("disabled={disabled || loading || modesLocked}");
    expect(promptInput).toContain("disabled={disabled || loading || permissionModesLocked}");
  });

  it("keeps the agent rail visible and disabled when the agent is locked", () => {
    expect(promptInput).toContain("const skipAgentList = agents.length === 0");
    expect(promptInput).not.toContain("agentLocked || agents.length === 0");
    expect(promptInput).toContain("agentLocked && \"opacity-40\"");
    expect(promptInput).toContain("disabled={option.disabled || agentLocked}");
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

describe("modelEffortTriggerLabel", () => {
  it("joins effort and Fast with a middle dot when Fast is on", () => {
    expect(
      modelEffortTriggerLabel({
        thinkingLabel: "Low",
        fastAvailable: true,
        fastEnabled: true,
        fastLabel: "Fast",
      }),
    ).toBe("Low · Fast");
  });

  it("shows only the thinking label when Fast is off", () => {
    expect(
      modelEffortTriggerLabel({
        thinkingLabel: "Low",
        fastAvailable: true,
        fastEnabled: false,
        fastLabel: "Fast",
      }),
    ).toBe("Low");
  });

  it("falls back to the fast label when there is no thinking ladder", () => {
    expect(
      modelEffortTriggerLabel({
        thinkingLabel: "",
        fastAvailable: true,
        fastLabel: "Fast",
      }),
    ).toBe("Fast");
  });

  it("is empty when neither effort nor fast is available", () => {
    expect(modelEffortTriggerLabel({})).toBe("");
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
  it("puts agent tabs and models in one popover without hover flyouts", () => {
    expect(promptInput).toContain("function PromptAgentConfigMenu");
    expect(promptInput).toContain("function ThinkingSliderPanel");
    expect(promptInput).toContain('orientation="vertical"');
    expect(promptInput).toContain("indicatorClassName=\"bg-active\"");
    expect(promptInput).toContain("agentTablist");
    expect(promptInput).not.toContain("openFlyout");
    expect(promptInput).not.toContain("{flyout ? (");
    expect(promptInput).not.toContain("function ConfigMenuRow");
    expect(promptInput).toContain("clip={false}");
    expect(promptInput).not.toContain("PromptAgentModelSelect");
    expect(promptInput).not.toContain("initialAgentModelSelectView");
    expect(promptInput).not.toContain("border-t border-border/60");
  });

  it("opens effort and fast controls from one selected-model chip", () => {
    expect(promptInput).toContain("showEffortControls");
    expect(promptInput).toContain("modelEffortTriggerLabel");
    expect(promptInput).toContain("fastLabel: labels.fastChip");
    expect(promptInput).toContain("function ThinkingSliderPanel");
    expect(promptInput).toContain('aria-label={labels.fastMode}');
    expect(promptInput).toContain("onClick={() => onModelChange(option.value)}");
  });

  it("searches models only, never agents", () => {
    expect(promptInput).toContain("placeholder={labels.searchModels}");
    expect(promptInput).not.toContain("searchPlaceholder={labels.searchAgents}");
  });

  it("renders PromptModel.trailing immediately after the option label", () => {
    expect(promptInput).toContain("trailing?: ReactNode");
    expect(promptInput).toContain("option.trailing");
    expect(promptInput).toContain(
      "Chip shown immediately after the option label (e.g. Native / ACP).",
    );
  });
});

describe("nested morph popover", () => {
  it("keeps a nested effort panel from dismissing the parent picker", () => {
    const morph = readFileSync(
      join(import.meta.dir, "../motion/popover-morph.tsx"),
      "utf8",
    );
    expect(morph).toContain("data-morph-anchor={ctx.triggerId}");
    expect(morph).toContain("hasOpenNestedMorphPopover");
    expect(morph).toContain("isNestedMorphPopoverPortal");
  });
});

describe("footerTrailing slot", () => {
  it("keeps a footer slot before submit for host controls such as context usage", () => {
    expect(promptInput).toContain("footerTrailing?: ReactNode");
    expect(promptInput).toContain("{footerTrailing}");
  });
});
