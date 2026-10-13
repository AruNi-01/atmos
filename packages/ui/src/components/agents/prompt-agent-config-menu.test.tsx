import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "../ui/tooltip";
import type { PromptInputLabels, PromptModel } from "./prompt-input";
import {
  PromptAgentConfigMenu,
  PromptEffortPopoverBody,
  selectPromptModel,
} from "./prompt-agent-config-menu";

const labels = {
  chooseModel: "Choose model",
  chooseAgent: "Agent",
  chooseMode: "Mode",
  choosePermission: "Permission",
  model: "Model",
  modelLocked: "Model locked",
  agentLocked: "This session cannot switch agents",
  modeLocked: "Mode locked",
  permissionLocked: "Permission locked",
  search: "Search",
  searchModels: "Search models",
  searchAgents: "Search agents",
  back: "Agents",
  noResults: "No results",
  loadingModels: "Loading models",
  loadModels: "Load",
  reloadModels: "Reload models",
  thinkingFaster: "Faster",
  thinkingSmarter: "Smarter",
  thinkingEffort: "Effort",
  fastMode: "Fast Tier",
  fastChip: "Fast",
  context: "Context",
  addFavorite: "Add favorite",
  removeFavorite: "Remove favorite",
  noFavorites: "No favorites yet",
} satisfies Required<PromptInputLabels>;

const levels: PromptModel[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function effortBody(extra: boolean, thinking: PromptModel[]) {
  return renderToStaticMarkup(
    <PromptEffortPopoverBody
      showContext={false}
      showThinking={thinking.length > 1}
      fastAvailable={false}
      contextLevels={[]}
      contextLabel=""
      contextOpen={false}
      onContextOpenChange={() => undefined}
      thinkingLevels={thinking}
      thinking="high"
      disabled={false}
      labels={labels}
      extraArgsText="--verbose"
      onExtraArgsChange={extra ? () => undefined : undefined}
      extraArgsLabel="Extra args"
      extraArgsPlaceholder="--config value"
    />,
  );
}

describe("PromptEffortPopoverBody", () => {
  it("shows extra args under the effort slider only when the caller passes the slot", () => {
    const terminal = effortBody(true, levels);
    const chat = effortBody(false, levels);
    expect(terminal).toContain("w-[18rem]");
    expect(terminal).toContain('aria-label="Extra args"');
    expect(terminal.indexOf("Effort")).toBeLessThan(terminal.indexOf("Extra args"));
    expect(chat).toContain("w-[13.75rem]");
    expect(chat).not.toContain("Extra args");
    expect(chat).not.toContain("w-[18rem]");
  });

  it("keeps the extra args field when there is no effort slider", () => {
    const markup = effortBody(true, []);
    expect(markup).toContain('aria-label="Extra args"');
    expect(markup).not.toContain(">Effort<");
  });
});

describe("PromptAgentConfigMenu headless tabs", () => {
  it("puts the unavailable reason on a disabled tab and a disabled favorite", () => {
    const reason = "Claude is not available headless";
    const markup = renderToStaticMarkup(
      <TooltipProvider>
      <PromptAgentConfigMenu
        menuInline
        controlRadius="rounded-lg"
        agents={[
          { value: "codex", label: "Codex" },
          { value: "claude", label: "Claude", disabled: true, disabledReason: reason },
        ]}
        agent="codex"
        models={[]}
        onModelChange={() => undefined}
        favoriteModels={[
          {
            value: "opus",
            label: "Opus",
            agent: "claude",
            disabled: true,
            disabledReason: reason,
          },
        ]}
        favoritesOpen
        thinkingLevels={[]}
        contextLevels={[]}
        fastAvailable={false}
        labels={labels}
        onExtraArgsChange={() => undefined}
        extraArgsLabel="Extra args"
      />
      </TooltipProvider>,
    );
    expect(markup).toContain(`title="${reason}"`);
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("This session cannot switch agents");
  });

  it("shows the effort chip on the selected model and not under an unselected list", () => {
    const models = [{ value: "stealth/union-alpha", label: "stealth/union-alpha" }];
    const unselected = renderToStaticMarkup(
      <TooltipProvider>
        <PromptAgentConfigMenu
          menuInline
          agents={[{ value: "codex", label: "Codex" }]}
          agent="codex"
          models={models}
          model=""
          onModelChange={() => undefined}
          thinkingLevels={levels}
          thinking="minimal"
          contextLevels={[]}
          fastAvailable={false}
          labels={labels}
          onExtraArgsChange={() => undefined}
          extraArgsLabel="Extra args"
        />
      </TooltipProvider>,
    );
    expect(unselected).not.toContain('aria-label="Minimal"');
    expect(unselected).not.toContain('aria-label="Extra args"');

    const selected = renderToStaticMarkup(
      <TooltipProvider>
        <PromptAgentConfigMenu
          menuInline
          agents={[{ value: "codex", label: "Codex" }]}
          agent="codex"
          models={models}
          model="stealth/union-alpha"
          onModelChange={() => undefined}
          thinkingLevels={[{ value: "minimal", label: "Minimal" }, ...levels]}
          thinking="minimal"
          contextLevels={[]}
          fastAvailable={false}
          labels={labels}
          onExtraArgsChange={() => undefined}
          extraArgsLabel="Extra args"
        />
      </TooltipProvider>,
    );
    expect(selected).toContain('aria-label="Minimal"');
  });

  it("does not show a standalone effort chip when the model list is empty", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <PromptAgentConfigMenu
          menuInline
          agents={[{ value: "claude", label: "Claude" }]}
          agent="claude"
          models={[]}
          model=""
          onModelChange={() => undefined}
          thinkingLevels={levels}
          thinking="low"
          contextLevels={[]}
          fastAvailable={false}
          labels={{ ...labels, noResults: "This agent has no model catalog." }}
          onExtraArgsChange={() => undefined}
          extraArgsLabel="Extra args"
        />
      </TooltipProvider>,
    );
    expect(markup).toContain("This agent has no model catalog.");
    expect(markup).not.toContain('aria-label="Low"');
    expect(markup).not.toContain('aria-label="Extra args"');
  });

  it("reports a chosen model and does not dismiss the surrounding picker", () => {
    let reported = "";
    const result = selectPromptModel(
      "stealth/union-alpha",
      { value: "stealth/union-alpha", label: "Alpha" },
      (model) => {
        reported = model;
      },
    );
    expect(reported).toBe("stealth/union-alpha");
    expect(result).toEqual({ model: "stealth/union-alpha", dismissPicker: false });

    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <PromptAgentConfigMenu
          menuInline
          agents={[{ value: "codex", label: "Codex" }]}
          agent="codex"
          models={[{ value: "stealth/union-alpha", label: "stealth/union-alpha" }]}
          model="stealth/union-alpha"
          onModelChange={() => undefined}
          thinkingLevels={levels}
          thinking="low"
          contextLevels={[]}
          fastAvailable={false}
          labels={labels}
        />
      </TooltipProvider>,
    );
    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('role="menuitem"');
    expect(markup).toContain('aria-label="Low"');
  });

  it("keeps extra args in an empty list when the agent has no effort levels", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <PromptAgentConfigMenu
          menuInline
          agents={[{ value: "gemini", label: "Gemini" }]}
          agent="gemini"
          models={[]}
          model=""
          onModelChange={() => undefined}
          thinkingLevels={[]}
          contextLevels={[]}
          fastAvailable={false}
          labels={labels}
          onExtraArgsChange={() => undefined}
          extraArgsLabel="Extra args"
        />
      </TooltipProvider>,
    );
    expect(markup).toContain('aria-label="Extra args"');
  });
});
