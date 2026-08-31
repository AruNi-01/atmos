import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
  "utf8",
);

describe("agent prompt composer", () => {
  it("uses the beui prompt input with a combined agent-model select and thinking slider", () => {
    expect(composer).toContain("AgentsPromptInput");
    expect(composer).toContain("agentLocked={agentLocked || !onProviderChange}");
    expect(composer).toContain("thinkingLevels=");
    expect(composer).toContain("isThinkingConfigId(option.id, option.category)");
    expect(composer).toContain("modes={toPromptModels(isConnected ? modeOption : null)}");
    expect(composer).toContain("onAgentChange={onProviderChange}");
    expect(composer).toContain('radius="3xl"');
    expect(composer).toContain('"w-full shadow-none"');
    expect(composer).not.toContain("rounded-t-none");
    expect(composer).toContain("mx-6 overflow-hidden rounded-t-3xl");
    expect(composer).toContain("modelsLocked={modelsLocked}");
    expect(composer).toContain("modesLocked={modesLocked}");
    expect(composer).toContain('modelLocked: t("composer.modelLocked")');
    expect(composer).toContain('modeLocked: t("composer.modeLocked")');
    expect(composer).toContain("onEmptyModelsOpen={onEmptyModelsOpen}");
    expect(composer).toContain('model: t("composer.model")');
    expect(composer).toContain('searchModels: t("composer.searchModels")');
    expect(composer).toContain('searchAgents: t("composer.searchAgents")');
  });

  it("renders image tiles and file pills in the composer header", () => {
    expect(composer).toContain("header={<AgentComposerAttachments />}");
    expect(composer).not.toContain('variant="inline"');
    expect(composer).not.toContain("AttachmentPreview");
    expect(composer).toContain("normalizeComposerImageFile");
  });

  it("reuses Welcome PromptComposer chips inside the beui editor slot", () => {
    expect(composer).toContain("editor={");
    expect(composer).toContain("<PromptComposer");
    expect(composer).toContain("expandAgentComposerText");
    expect(composer).toContain("insertAiContext");
    expect(composer).not.toContain("SlashCommandChip");
  });

  it("uses a three-line editor on new chat and a one-line editor after the session exists", () => {
    expect(composer).toContain("minRows={landing ? 2 : 1}");
    expect(composer).toContain('"min-h-16 max-h-40 rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"');
    expect(composer).toContain('"min-h-5 max-h-40 rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"');
    expect(composer).toContain("data-agent-composer-landing={landing ? \"true\" : undefined}");
  });

  it("resolves placeholder from session create/resume/live state", () => {
    expect(composer).toContain("resolveAgentComposerPlaceholderKind");
    expect(composer).toContain("composer.placeholder.${placeholderKind}");
  });

  it("accepts Files drag-and-drop as composer file chips", () => {
    expect(composer).toContain("hasAgentContextDragData");
    expect(composer).toContain("getAgentContextDragItems");
    expect(composer).toContain("insertFileMention");
  });

  it("edits queued messages in the prompt input without replacing the stashed draft", () => {
    expect(composer).toContain("stashRef");
    expect(composer).toContain("filesFromQueuedItem");
    expect(composer).toContain("filesFromComposerParts");
    expect(composer).toContain("onFinishEdit");
    expect(composer).toContain("border-dashed border-info");
    expect(composer).toContain('data-queue-editing={editingItem ? "true" : undefined}');
    expect(composer).toContain("if (editingItem) {");
    expect(composer).toContain("onUpdateQueuedPrompt(editingItem.id, composed)");
    expect(composer).not.toContain("onUpdatePrompt={onUpdateQueuedPrompt}");
  });
});
