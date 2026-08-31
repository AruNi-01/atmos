import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentConfigOption, AgentPlan } from "@/features/agent/hooks/use-agent-session";
import type { AgentModelCatalog } from "@/api/ws/agent-chat-api";
import type {
  AgentChatIndexEntry,
  AgentChatListRequest,
  SessionAdvertisedOption,
} from "@atmos/api-types/ws/dto/agent-chat";

type ThinkingShape = {
  type?: string;
  options?: string[];
};

const THINKING_LEVEL_LABELS: Record<string, string> = {
  off: "Off",
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  extra_high: "Extra high",
  max: "Max",
  maximum: "Maximum",
};

export function thinkingLevelLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return THINKING_LEVEL_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

export function isThinkingConfigId(
  id: string,
  category?: string | null,
): boolean {
  return [id, category ?? ""].some((value) => {
    const token = value.trim().toLowerCase();
    if (!token) return false;
    return (
      token === "thinking" ||
      token === "think" ||
      token === "thought_level" ||
      token === "effort" ||
      token === "reasoning" ||
      token === "reasoning_effort" ||
      token === "reasoning-effort" ||
      token.includes("reason")
    );
  });
}

function listedThinkingOptions(thinking: ThinkingShape | undefined): string[] {
  if (!Array.isArray(thinking?.options)) return [];
  return thinking.options.map((item) => item.trim()).filter((item) => item.length > 0);
}

function choicesFromThinking(thinking: ThinkingShape | undefined): string[] {
  if (!thinking || thinking.type === "none" || thinking.type === "encoded_in_model") {
    return [];
  }
  const listed = listedThinkingOptions(thinking);
  if (thinking.type === "enum" || listed.length > 0) return listed;
  return [];
}

export function thinkingChoices(catalog: AgentModelCatalog | null, modelId: string): string[] {
  const model = catalog?.models.find((item) => item.id === modelId);
  const perModel = model?.thinking as ThinkingShape | undefined;
  if (perModel && perModel.type === "none") return [];
  const listed = choicesFromThinking(perModel);
  if (listed.length > 0) return listed;
  return choicesFromThinking(catalog?.thinking as ThinkingShape | undefined);
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

export function probingCatalog(agentId: string): AgentModelCatalog {
  return {
    agent_id: agentId,
    status: "probing",
    models: [],
    modes: [],
    thinking: { type: "none" },
    strategies_used: [],
    fetched_at: "",
    source: "live",
    message: null,
  };
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
  } else if (resolvedModelId) {
    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: resolvedModelId,
      options: [{ value: resolvedModelId, name: resolvedModelId }],
    });
  }
  const thinking = thinkingChoices(catalog, resolvedModelId);
  if (thinking.length > 0) {
    options.push({
      id: "thinking",
      name: "Thinking",
      type: "select",
      currentValue: thinkingId || thinking[0] || "",
      options: thinking.map((value) => ({
        value,
        name: thinkingLevelLabel(value),
      })),
    });
  }
  return options;
}

export function configKindMatches(id: string, category: string | null | undefined, kind: string): boolean {
  if (kind === "thinking") return isThinkingConfigId(id, category);
  const aliases =
    kind === "model"
      ? ["model", "models"]
      : kind === "mode"
        ? ["mode", "modes"]
        : [kind];
  const needle = id.trim().toLowerCase();
  const cat = category?.trim().toLowerCase() ?? "";
  return aliases.some((alias) => needle === alias || cat === alias);
}

export function overlayPendingConfigValues(
  options: AgentConfigOption[],
  pending: { modelId?: string; modeId?: string; thinkingId?: string },
): AgentConfigOption[] {
  return options.map((option) => {
    const pendingValue = configKindMatches(option.id, option.category, "model")
      ? pending.modelId
      : configKindMatches(option.id, option.category, "mode")
        ? pending.modeId
        : configKindMatches(option.id, option.category, "thinking")
          ? pending.thinkingId
          : undefined;
    const trimmed = pendingValue?.trim();
    if (!trimmed) return option;
    if (option.options.some((item) => item.value === trimmed)) {
      return { ...option, currentValue: trimmed };
    }
    return option;
  });
}

export function advertisedOptionsToConfigOptions(
  rows: SessionAdvertisedOption[] | null | undefined,
): AgentConfigOption[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? undefined,
    category: row.category ?? undefined,
    type: row.type || "select",
    currentValue: row.current_value ?? "",
    options: (row.options ?? []).map((item) => ({
      value: item.value,
      name: item.name ?? undefined,
    })),
  }));
}

export function isComposerTrailingConfigOption(option: {
  id: string;
  category?: string | null;
}): boolean {
  const id = option.id.trim().toLowerCase();
  if (id === "model" || id === "models") return true;
  return isThinkingConfigId(option.id, option.category);
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
  origin: "quick" | "normal";
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
    origin: item.origin === "quick" ? "quick" : "normal",
    updated_at: item.updated_at,
  }));
}

export function agentChatHistoryListRequest(input: {
  variant: "modal" | "sidebar" | "standalone" | "center";
  workspaceId?: string | null;
  projectId?: string | null;
}): AgentChatListRequest {
  if (input.variant === "modal") {
    return { all: true, origin: "quick" };
  }
  if (input.variant === "standalone") {
    return { all: true };
  }
  return {
    workspace_id: input.workspaceId ?? null,
    project_id: input.projectId ?? null,
  };
}

export function filterAgentChatHistoryRows(
  rows: AgentChatHistoryRow[],
  query: string,
): AgentChatHistoryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const title = row.title?.trim().toLowerCase() ?? "";
    return title.includes(q);
  });
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
  if (entries.length === 0) return null;
  return { entries };
}
