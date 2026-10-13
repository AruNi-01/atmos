import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentConfigFlyoutOffsetTop,
  agentConfigFlyoutSide,
  agentConfigTriggerText,
  capitalizeLeading,
  contextModelSuffix,
  formatModelProviderLabel,
  groupedPromptModelRows,
  modelEffortTriggerLabel,
} from "./prompt-input-view";

const promptInput = readFileSync(join(import.meta.dir, "./prompt-input.tsx"), "utf8");
const promptMenu = readFileSync(join(import.meta.dir, "./prompt-agent-config-menu.tsx"), "utf8");

describe("empty model list reload", () => {
  it("asks the host to reload when the model picker opens with no models", () => {
    expect(promptMenu).toContain("onEmptyModelsOpen");
    expect(promptMenu).toContain("if (next && models.length === 0 && !favoritesOpen)");
  });

  it("offers a Load button only when the catalog is empty, not when search filters models out", () => {
    expect(promptMenu).toContain("onLoadModels");
    expect(promptMenu).toContain("labels.loadModels");
    expect(promptMenu).toContain("onClick={() => onLoadModels()}");
    const menuStart = promptMenu.indexOf("function PromptAgentConfigMenu");
    const menuEnd = promptMenu.indexOf("function ConfigFlyoutList");
    const menu = promptMenu.slice(menuStart, menuEnd);
    const catalogEmpty = menu.indexOf(") : listedModels.length === 0 ? (");
    const searchEmpty = menu.indexOf(") : filteredModels.length === 0 ? (");
    const loadLabel = menu.indexOf("{labels.loadModels}");
    expect(catalogEmpty).toBeGreaterThan(0);
    expect(searchEmpty).toBeGreaterThan(catalogEmpty);
    expect(loadLabel).toBeGreaterThan(catalogEmpty);
    expect(loadLabel).toBeLessThan(searchEmpty);
    expect(menu).toContain("{listedModels.length > 0 ? (");
    expect(menu).toContain("favoritesOpen ? labels.noFavorites : labels.noResults");
  });

  it("places an icon-only reload control beside the model search field", () => {
    expect(promptMenu).toContain("modelsReloading");
    expect(promptMenu).toContain("RefreshCw");
    const menuStart = promptMenu.indexOf("function PromptAgentConfigMenu");
    const menuEnd = promptMenu.indexOf("function ConfigFlyoutList");
    const menu = promptMenu.slice(menuStart, menuEnd);
    const searchAt = menu.indexOf("<SelectSearch");
    const reloadAt = menu.indexOf("aria-label={labels.reloadModels}");
    const listAt = menu.indexOf("min-h-0 flex-1 overflow-y-auto");
    expect(searchAt).toBeGreaterThan(0);
    expect(reloadAt).toBeGreaterThan(searchAt);
    expect(reloadAt).toBeLessThan(listAt);
    expect(menu).toContain("grid size-7 shrink-0 place-items-center rounded-xl");
    expect(menu).not.toContain("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground");
  });
});

describe("locked session config", () => {
  it("does not select a different model when models are locked", () => {
    expect(promptMenu).toContain("option.disabled || modelsLocked");
    expect(promptInput).toContain("disabled={disabled || loading || modesLocked}");
    expect(promptInput).toContain("disabled={disabled || loading || permissionModesLocked}");
  });

  it("keeps the agent rail visible and disabled when the agent is locked", () => {
    expect(promptMenu).toContain("const skipAgentList = agents.length === 0");
    expect(promptMenu).not.toContain("agentLocked || agents.length === 0");
    expect(promptMenu).toContain("agentLocked && \"opacity-40\"");
    expect(promptMenu).toContain("disabled={option.disabled || agentLocked}");
  });
});

describe("mode picker", () => {
  it("uses the agent/model MorphPopover instead of the motion Select", () => {
    const start = promptInput.indexOf("function PromptOptionSelect");
    const selectFn = promptInput.slice(start);
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

  it("appends 1M after the model name when that context is selected", () => {
    expect(
      agentConfigTriggerText({
        modelLabel: "Claude Opus 5",
        contextLabel: "1M",
        thinkingLabel: "Extra high",
      }),
    ).toBe("Claude Opus 5 1M · Extra high");
    expect(
      agentConfigTriggerText({
        modelLabel: "Claude Opus 5 1M",
        contextLabel: "1M",
        thinkingLabel: "Extra high",
      }),
    ).toBe("Claude Opus 5 1M · Extra high");
    expect(
      agentConfigTriggerText({
        modelLabel: "Claude Opus 5",
        contextLabel: contextModelSuffix("300K", "300k"),
        thinkingLabel: "Low",
      }),
    ).toBe("Claude Opus 5 · Low");
    expect(contextModelSuffix("1M", "1m")).toBe("1M");
    expect(contextModelSuffix("272K", "272k")).toBe("");
  });

  it("appends Fast on the closed trigger when Fast is on", () => {
    expect(
      agentConfigTriggerText({
        modelLabel: "Grok 4.7",
        thinkingLabel: "Extra high",
        fastLabel: "Fast",
      }),
    ).toBe("Grok 4.7 · Extra high · Fast");
    expect(
      agentConfigTriggerText({
        modelLabel: "Grok 4.7",
        fastLabel: "Fast",
      }),
    ).toBe("Grok 4.7 · Fast");
    expect(
      agentConfigTriggerText({
        agentLabel: "Grok",
        fastLabel: "Fast",
      }),
    ).toBe("Grok · Fast");
    expect(
      agentConfigTriggerText({
        modelLabel: "Grok 4.7",
        thinkingLabel: "Extra high",
      }),
    ).toBe("Grok 4.7 · Extra high");
  });
});

describe("formatModelProviderLabel", () => {
  it("puts a capitalized provider after the model name", () => {
    expect(formatModelProviderLabel("gpt-5", "openai")).toBe("gpt-5 / Openai");
    expect(formatModelProviderLabel("GPT-5", "OpenAI")).toBe("GPT-5 / OpenAI");
    expect(capitalizeLeading("anthropic")).toBe("Anthropic");
    expect(capitalizeLeading("OpenAI")).toBe("OpenAI");
  });

  it("omits the provider when it is missing", () => {
    expect(formatModelProviderLabel("gpt-5", "")).toBe("gpt-5");
    expect(formatModelProviderLabel("gpt-5", null)).toBe("gpt-5");
  });
});

describe("groupedPromptModelRows", () => {
  it("inserts a header when the group changes and leaves ungrouped rows first", () => {
    expect(
      groupedPromptModelRows([
        { value: "auto", group: undefined },
        { value: "opus", group: "Anthropic" },
        { value: "sonnet", group: "Anthropic" },
        { value: "sol", group: "OpenAI" },
      ]),
    ).toEqual([
      { type: "option", option: { value: "auto", group: undefined } },
      { type: "header", label: "Anthropic" },
      { type: "option", option: { value: "opus", group: "Anthropic" } },
      { type: "option", option: { value: "sonnet", group: "Anthropic" } },
      { type: "header", label: "OpenAI" },
      { type: "option", option: { value: "sol", group: "OpenAI" } },
    ]);
  });

  it("clusters a repeated group so the header is unique", () => {
    expect(
      groupedPromptModelRows([
        { value: "auto", group: undefined },
        { value: "opus-5", group: "Anthropic" },
        { value: "opus-5-fast", group: undefined },
        { value: "opus-4-8", group: "Anthropic" },
        { value: "sol", group: "OpenAI" },
      ]),
    ).toEqual([
      { type: "option", option: { value: "auto", group: undefined } },
      { type: "option", option: { value: "opus-5-fast", group: undefined } },
      { type: "header", label: "Anthropic" },
      { type: "option", option: { value: "opus-5", group: "Anthropic" } },
      { type: "option", option: { value: "opus-4-8", group: "Anthropic" } },
      { type: "header", label: "OpenAI" },
      { type: "option", option: { value: "sol", group: "OpenAI" } },
    ]);
  });
});

describe("S2 thinking control visibility", () => {
  it("shows the effort slider only when there are at least two levels", () => {
    expect(promptMenu).toContain("thinkingLevels.length > 1");
    expect(promptMenu).toContain("function ThinkingSliderPanel");
    expect(promptMenu).toContain('variant="effort"');
  });
});

describe("PromptAgentConfigMenu", () => {
  it("can render the agent config menu without the prompt shell", () => {
    expect(promptInput).toContain("configOnly");
    expect(promptMenu).toContain("side={menuSide}");
  });

  it("can embed the agent/model panel without a trigger button", () => {
    expect(promptMenu).toContain("menuInline");
    const menuStart = promptMenu.indexOf("function PromptAgentConfigMenu");
    const menuEnd = promptMenu.indexOf("function PromptEffortPopoverBody");
    const menu = promptMenu.slice(menuStart, menuEnd);
    expect(menu).toContain("if (menuInline)");
    expect(menu).toContain("return panel");
    const inlineAt = menu.indexOf("if (menuInline)");
    expect(menu.indexOf("const panel =")).toBeLessThan(inlineAt);
    expect(menu.indexOf("<MorphPopoverTrigger>", inlineAt)).toBeGreaterThan(inlineAt);
  });

  it("puts agent tabs and models in one popover without hover flyouts", () => {
    expect(promptMenu).toContain("function PromptAgentConfigMenu");
    expect(promptMenu).toContain("function ThinkingSliderPanel");
    expect(promptMenu).toContain('orientation="vertical"');
    expect(promptMenu).toContain("indicatorClassName=\"bg-active\"");
    expect(promptMenu).toContain("agentTablist");
    expect(promptMenu).not.toContain("openFlyout");
    expect(promptMenu).not.toContain("{flyout ? (");
    expect(promptMenu).not.toContain("function ConfigMenuRow");
    expect(promptMenu).toContain("clip={false}");
    expect(promptMenu).not.toContain("PromptAgentModelSelect");
    expect(promptMenu).not.toContain("initialAgentModelSelectView");
    expect(promptMenu).not.toContain("border-t border-border/60");
  });

  it("turns the model-row dot into a favorite star on hover", () => {
    expect(promptMenu).toContain("favoriteModels");
    expect(promptMenu).toContain("favoritesOpen");
    expect(promptMenu).toContain("onToggleFavorite");
    expect(promptMenu).toContain("function ModelFavoriteMark");
    expect(promptMenu).toContain("group/model");
    expect(promptMenu).toContain("fill-favorite text-favorite");
    expect(promptMenu).toContain("labels.noFavorites");
  });

  it("opens effort and fast controls from one selected-model chip", () => {
    expect(promptMenu).toContain("showEffortControls");
    expect(promptMenu).toContain("contextLabel: contextSuffix");
    expect(promptMenu).toContain("fastLabel: labels.fastChip");
    expect(promptMenu).toContain("function ThinkingSliderPanel");
    expect(promptMenu).toContain('aria-label={labels.fastMode}');
    expect(promptMenu).toContain("onModelChange(option.value, option)");
    expect(promptMenu).toContain("function ModelFavoriteMark");
    expect(promptMenu).toContain("group/model");
    expect(promptMenu).toContain("option.favorited");
  });

  it("puts a Context submenu at the top of the effort popover", () => {
    expect(promptMenu).toContain("showContext = contextLevels.length > 1");
    expect(promptMenu).toContain("{labels.context}");
    expect(promptMenu).toContain("onContextChange?.(level.value)");
    expect(promptMenu).toContain("side=\"right\"");
    expect(promptMenu).toContain(
      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none",
    );
    expect(promptMenu).toContain('className="flex w-full"');
    expect(promptMenu).toContain(
      'className="flex h-9 w-full min-w-0 items-center gap-3 rounded-lg px-2.5 text-left outline-none hover:bg-muted/70 focus-visible:ring-2"',
    );
    const contextIdx = promptMenu.indexOf("{showContext ? (");
    const thinkingIdx = promptMenu.indexOf("{showThinking ? (");
    const fastIdx = promptMenu.indexOf("{fastAvailable ? (");
    expect(contextIdx).toBeGreaterThan(0);
    expect(contextIdx).toBeLessThan(thinkingIdx);
    expect(thinkingIdx).toBeLessThan(fastIdx);
  });

  it("searches models only, never agents", () => {
    expect(promptMenu).toContain("placeholder={labels.searchModels}");
    expect(promptMenu).not.toContain("searchPlaceholder={labels.searchAgents}");
  });

  it("keeps the send-adjacent trigger on the model name without multiplier", () => {
    expect(promptMenu).toContain("modelLabel: optionName(currentModel)");
    expect(promptMenu).not.toContain("modelLabel: optionLabelText(currentModel)");
  });

  it("renders PromptModel.trailing immediately after the option label", () => {
    expect(promptInput).toContain("trailing?: ReactNode");
    expect(promptMenu).toContain("option.trailing");
    expect(promptInput).toContain(
      "Chip shown immediately after the option label (e.g. Native / ACP).",
    );
  });

  it("shows group headers and a muted multiplier, not a / provider suffix", () => {
    expect(promptInput).toContain("group?: string");
    expect(promptInput).toContain("groupIcon?: ReactNode");
    expect(promptMenu).toContain("following.option.groupIcon");
    expect(promptMenu).toContain(
      "flex items-center gap-1.5 px-2.5 pt-2 pb-0.5 text-xs text-muted-foreground",
    );
    expect(promptInput).toContain("multiplier?: string");
    expect(promptMenu).toContain("groupedPromptModelRows");
    expect(promptMenu).toContain("row.type === \"header\"");
    expect(promptMenu).toContain("key={`group:${index}:${row.label}`}");
    expect(promptMenu).toContain('(option.group ?? "").trim() ? "pl-4 pr-2.5" : "px-2.5"');
    expect(promptMenu).toContain("text-sm text-muted-foreground");
    expect(promptMenu).not.toContain("` / ${provider}`");
    expect(promptMenu).toContain("const fullLabel = modelLabelWithContext(optionName(option), isSelected ? contextSuffix : \"\")");
    expect(promptMenu).toContain(
      "label: modelLabelWithContext(optionName(option), contextSuffix)",
    );
    expect(promptMenu).toContain("modelsLocked\n                    ? labels.modelLocked");
    expect(promptMenu).toContain("min-w-0 truncate text-sm");
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
    expect(morph).toContain("popoverPortalCoords");
  });
});

describe("footerTrailing slot", () => {
  it("keeps a footer slot before submit for host controls such as context usage", () => {
    expect(promptInput).toContain("footerTrailing?: ReactNode");
    expect(promptInput).toContain("{footerTrailing}");
  });
});
