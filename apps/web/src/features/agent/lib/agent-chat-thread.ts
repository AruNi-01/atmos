import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentConfigOption, AgentPlan } from "@/features/agent/hooks/use-agent-session";
import type { AgentModelCatalog } from "@/api/ws/agent-chat-api";
import type { AgentChatIndexEntry } from "@atmos/api-types/ws/dto/agent-chat";

type ThinkingShape = {
  type?: string;
  options?: string[];
};

export function thinkingChoices(catalog: AgentModelCatalog | null, modelId: string): string[] {
  const model = catalog?.models.find((item) => item.id === modelId);
  const thinking = (model?.thinking ?? catalog?.thinking) as ThinkingShape | undefined;
  if (!thinking || thinking.type === "none" || thinking.type === "encoded_in_model") {
    return [];
  }
  if (thinking.type === "enum" && Array.isArray(thinking.options)) {
    return thinking.options.filter((item) => item.trim().length > 0);
  }
  return [];
}

export function isCatalogModelsLoading(
  catalog: AgentModelCatalog | null | undefined,
  providerId: string,
): boolean {
  if (!providerId.trim()) return false;
  if (!catalog) return true;
  if (catalog.agent_id && catalog.agent_id !== providerId) return true;
  return catalog.status === "probing";
}

export function defaultCatalogModelId(
  catalog: AgentModelCatalog | null | undefined,
  currentId = "",
): string {
  if (!catalog || catalog.models.length === 0) return currentId;
  if (currentId && catalog.models.some((model) => model.id === currentId)) {
    return currentId;
  }
  return catalog.models.find((model) => model.is_default)?.id || catalog.models[0]?.id || "";
}

export function catalogToConfigOptions(
  catalog: AgentModelCatalog | null,
  modelId: string,
  thinkingId: string,
  modeId = "",
): AgentConfigOption[] {
  if (!catalog) return [];
  const options: AgentConfigOption[] = [];
  if (catalog.modes.length > 0) {
    const defaultMode =
      catalog.modes.find((mode) => mode.is_default)?.id || catalog.modes[0]?.id || "";
    options.push({
      id: "mode",
      name: "Mode",
      type: "select",
      currentValue: modeId || defaultMode,
      options: catalog.modes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  const resolvedModelId = defaultCatalogModelId(catalog, modelId);
  if (catalog.models.length > 0) {
    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: resolvedModelId,
      options: catalog.models.map((model) => ({
        value: model.id,
        name: model.label || model.id,
      })),
    });
  }
  const thinking = thinkingChoices(catalog, resolvedModelId);
  if (thinking.length > 0) {
    options.push({
      id: "thinking",
      name: "Thinking",
      type: "select",
      currentValue: thinkingId || thinking[0] || "",
      options: thinking.map((value) => ({ value, name: value })),
    });
  }
  return options;
}

const COMPOSER_TRAILING_CONFIG_IDS = new Set(["model", "models", "thinking", "think"]);

export function isComposerTrailingConfigOption(option: { id: string }): boolean {
  return COMPOSER_TRAILING_CONFIG_IDS.has(option.id.trim().toLowerCase());
}

export function splitComposerConfigOptions(options: AgentConfigOption[]): {
  leading: AgentConfigOption[];
  trailing: AgentConfigOption[];
} {
  const select = options.filter((option) => option.type === "select" && option.options.length > 0);
  return {
    leading: select.filter((option) => !isComposerTrailingConfigOption(option)),
    trailing: select.filter(isComposerTrailingConfigOption),
  };
}

export type AgentChatHistoryRow = {
  chat_id: string;
  provider_id: string;
  title: string | null;
  cwd: string;
  updated_at: string | null;
};

export function chatTitleFromPrompt(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!line) return "";
  return Array.from(line).slice(0, 60).join("");
}

export function chatsToHistoryRows(
  items: AgentChatIndexEntry[],
): AgentChatHistoryRow[] {
  return items.map((item) => ({
    chat_id: item.id,
    provider_id: item.provider_id,
    title: item.title,
    cwd: item.cwd,
    updated_at: item.updated_at,
  }));
}

export function queueToPrompts(
  items: Array<{
    id: string;
    prompt: string;
    display_prompt?: string | null;
    attachments?: string[];
    status?: string;
  }>,
  workspaceId: string | null,
  projectId: string | null,
): QueuedAgentPrompt[] {
  return items.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    displayPrompt: item.display_prompt ?? item.prompt,
    attachmentPaths: item.attachments,
    workspaceId,
    projectId,
    mode: "default",
    origin: "agent-chat-queue",
    createdAt: 0,
  }));
}

export function parsePlan(value: unknown): AgentPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { entries?: unknown };
  if (!Array.isArray(record.entries)) return null;
  const entries = record.entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as { content?: unknown; priority?: unknown; status?: unknown };
      if (typeof item.content !== "string") return null;
      return {
        content: item.content,
        priority: typeof item.priority === "string" ? item.priority : "medium",
        status: typeof item.status === "string" ? item.status : "pending",
      };
    })
    .filter((entry): entry is AgentPlan["entries"][number] => entry !== null);
  return { entries };
}
