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
    expect(composer).toContain("modes={toPromptModels(isConnected ? modeOption : null)}");
    expect(composer).toContain("onAgentChange={onProviderChange}");
    expect(composer).toContain('radius="3xl"');
    expect(composer).toContain('className="w-full shadow-none"');
    expect(composer).not.toContain("rounded-t-none");
    expect(composer).toContain("mx-6 overflow-hidden rounded-t-3xl");
    expect(composer).toContain("catalogModelsLoading");
    expect(composer).toContain("modelsLoading={isConnecting || isResumingHistory || catalogModelsLoading}");
    expect(composer).toContain('model: t("composer.model")');
    expect(composer).toContain('searchModels: t("composer.searchModels")');
    expect(composer).toContain('searchAgents: t("composer.searchAgents")');
  });

  it("reuses Welcome PromptComposer chips inside the beui editor slot", () => {
    expect(composer).toContain("editor={");
    expect(composer).toContain("<PromptComposer");
    expect(composer).toContain("expandAgentComposerText");
    expect(composer).toContain("insertAiContext");
    expect(composer).not.toContain("SlashCommandChip");
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
});
