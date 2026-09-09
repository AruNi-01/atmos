import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
  "utf8",
);

describe("agent prompt composer", () => {
  it("APP-069 S9 has no standing Fork or Rewind composer buttons", () => {
    expect(composer).not.toMatch(/["']Fork["']/);
    expect(composer).not.toMatch(/["']Rewind["']/);
    expect(composer).not.toContain("sessionOpFork");
    expect(composer).not.toContain("sessionOpRewind");
    expect(composer).not.toContain("onFork");
    expect(composer).not.toContain("onRewind");
    expect(composer).not.toContain("<AgentSessionOpCard");
  });

  it("S6 keeps mode and permission as first-class pickers without dumping ACP groups", () => {
    expect(composer).toContain(
      'configOptions.find((option) => configKindMatches(option.id, option.category, "mode"))',
    );
    expect(composer).toContain(
      'configKindMatches(option.id, option.category, "permission_mode")',
    );
    expect(composer).not.toContain("splitComposerConfigOptions");
    expect(composer).not.toContain("extraConfigOptions");
    expect(composer).toContain("thinkingLevels=");
    expect(composer).toContain("thinkingLevelMessageKey");
    expect(composer).toContain("chatPanel.pickers.thinkingLevels");
    expect(composer).toContain("modes={toModePromptModels");
    expect(composer).toContain("permissionModes={toPermissionPromptModels");
    expect(composer).not.toContain("modes={[]}");
    expect(composer).not.toContain("composerConfigIcon");
    expect(composer).not.toContain("ConfigOptionDropdown");
    expect(composer).toContain("ShieldAlert");
    expect(composer).toContain("Astroid");
    expect(composer).toContain("PencilSparkles");
    expect(composer).toContain("function modeIcon");
    expect(composer).toContain("ListTodo");
    expect(composer).toContain("Hammer");
    expect(composer).toContain("MessageSquare");
    expect(composer).toContain("MessageCircleQuestionMark");
    expect(composer).toContain("BotMessageSquare");
    expect(composer).not.toContain("icon: <Bot className=\"size-3.5 shrink-0\" />");
  });

  it("uses the beui prompt input with a combined agent-model menu and effort slider labels", () => {
    expect(composer).toContain("AgentsPromptInput");
    expect(composer).toContain("agentLocked={agentLocked || !onProviderChange}");
    expect(composer).toContain("thinkingLevels=");
    expect(composer).toContain("group: entry.group");
    expect(composer).toContain('fastMode: t("composer.fastMode")');
    expect(composer).toContain("isThinkingConfigId(option.id, option.category)");
    expect(composer).toContain("modes={toModePromptModels");
    expect(composer).toContain("permissionModes={toPermissionPromptModels");
    expect(composer).toContain("onAgentChange={onProviderChange}");
    expect(composer).toContain("agentTablist=");
    expect(composer).toContain('orientation="vertical"');
    expect(composer).toContain("CenterStageTabList");
    expect(composer).toContain("size-9 px-0");
    expect(composer).toContain("size={20}");
    expect(composer).toContain("agentOptions.length === 0 ? null");
    expect(composer).not.toContain("agentLocked || !onProviderChange || agentOptions.length === 0");
    expect(composer).toContain("const agentsLocked = agentLocked || !onProviderChange");
    expect(composer).toContain('agentsLocked && "opacity-40"');
    expect(composer).toContain('fastChip: t("composer.fastChip")');
    expect(composer).toContain('context: t("composer.context")');
    expect(composer).toContain("contextLevels={toPromptModels(contextOption)}");
    expect(composer).toContain('agentLocked: t("composer.agentLocked")');
    expect(composer).toContain('radius="3xl"');
    expect(composer).toContain('"w-full shadow-none"');
    expect(composer).not.toContain("joinUpperCards");
    expect(composer).not.toContain("!rounded-t-none border-t-0");
    expect(composer).toContain(
      "relative z-[1] mx-6 -mb-px overflow-hidden rounded-t-3xl border border-b-0 border-foreground/10 bg-foreground/[0.04]",
    );
    expect(composer).not.toContain("mx-6 overflow-hidden rounded-3xl border border-border/70 bg-background/95");
    expect(composer).not.toContain("border-b-0 border-border/70 bg-background/95");
    expect(composer).not.toContain("relative flex flex-col gap-2");
    expect(composer).not.toContain("ComposerFlyingMessagePortal");
    expect(composer).not.toContain("launchComposerFly");
    expect(composer).not.toContain("onFlySend");
    expect(composer).toContain("data-agent-composer-upper-cards");
    expect(composer).toContain("<BackgroundCommandsDock tools={backgroundTools} />");
    expect(composer).toContain('data-agent-chat-above-composer-overlays=""');
    expect(composer).toContain(
      '"pointer-events-none absolute inset-x-0 bottom-full z-20 flex w-full flex-col gap-2 has-[.pointer-events-auto]:pb-2"',
    );
    expect(composer).toContain('data-agent-chat-scroll-button-host=""');
    expect(composer).toContain("empty:hidden");
    expect(composer).toContain('hasUpperComposerCards && "px-6"');
    expect(composer.indexOf("data-agent-chat-scroll-button-host")).toBeLessThan(
      composer.indexOf("data-agent-composer-upper-cards"),
    );
    expect(composer).toContain("modelsLocked={modelsLocked}");
    expect(composer).toContain("modesLocked={modesLocked}");
    expect(composer).toContain('modelLocked: t("composer.modelLocked")');
    expect(composer).toContain('modeLocked: t("composer.modeLocked")');
    expect(composer).toContain('permissionLocked: t("composer.permissionLocked")');
    expect(composer).toContain("onEmptyModelsOpen={onEmptyModelsOpen}");
    expect(composer).toContain("onLoadModels={onLoadModels}");
    expect(composer).toContain('loadModels: t("composer.loadModels")');
    expect(composer).toContain('reloadModels: t("composer.reloadModels")');
    expect(composer).toContain("modelsReloading={catalogModelsReloading}");
    expect(composer).toContain("const composerLocked = isResumingHistory && !isConnected");
    expect(composer).toContain("disabled={composerLocked}");
    expect(composer).not.toContain("disabled={!isConnected}");
    expect(composer).toContain("modes={toModePromptModels(modeOption)}");
    expect(composer).not.toContain("toModePromptModels(isConnected ? modeOption : null)");
    expect(composer).toContain('model: t("composer.model")');
    expect(composer).toContain('searchModels: t("composer.searchModels")');
    expect(composer).toContain('searchAgents: t("composer.searchAgents")');
    expect(composer).toContain(
      'configOptions.find((option) => configKindMatches(option.id, option.category, "mode"))',
    );
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
    expect(composer).toContain("onSkillDisableFilterChange={onSkillDisableFilterChange}");
    expect(composer).toContain("onSkillDisableSessionClosed={onSkillDisableSessionClosed}");
    expect(composer).toContain("submitOnEnter={!skillDisableSessionOpen}");
    expect(composer).toContain("closePopovers()");
    expect(composer).toContain("stripSkillDisableSession");
    expect(composer).not.toContain("SlashCommandChip");
  });

  it("uses a three-line editor on new chat and a one-line editor after the session exists", () => {
    expect(composer).toContain("minRows={landing ? 2 : 1}");
    expect(composer).toContain('"min-h-16 max-h-40 select-text rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"');
    expect(composer).toContain('"min-h-5 max-h-40 select-text rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5"');
    expect(composer).not.toContain("data-agent-composer-landing");
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

  it("clears composer attachments before waiting for send", () => {
    const start = composer.indexOf("onSubmit={async (text) => {");
    const end = composer.indexOf("onStop={", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = composer.slice(start, end);
    const convertAt = body.indexOf("filesForSubmit(files)");
    const clearAt = body.indexOf("attachments.clear()");
    const submitAt = body.indexOf("await onSubmit({ text: composed, files: converted })");
    expect(convertAt).toBeGreaterThan(-1);
    expect(body).not.toContain("onFlySend");
    expect(clearAt).toBeGreaterThan(convertAt);
    expect(submitAt).toBeGreaterThan(clearAt);
    expect(body).toContain("filesFromComposerParts(converted)");
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
