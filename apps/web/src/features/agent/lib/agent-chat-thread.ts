import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentConfigOption, AgentPlan } from "@/features/agent/lib/agent-chat-types";
import type { AgentModelCatalog } from "@/api/ws/agent-chat-api";
import type {
  AgentChatIndexEntry,
  AgentChatListRequest,
  AgentDescriptor,
  AgentOptionSupport,
  AgentThinkingSupport,
} from "@atmos/api-types/ws/dto/agent-chat";

type ThinkingShape = {
  type?: string;
  options?: string[];
};

function thinkingChoicesFromSupport(
  thinking: AgentThinkingSupport | ThinkingShape | null | undefined,
): string[] {
  if (!thinking || thinking.type === "none" || thinking.type === "encoded_in_model") {
    return [];
  }
  const options = "options" in thinking ? thinking.options : undefined;
  if (!Array.isArray(options)) return [];
  return options.map((item: string) => item.trim()).filter((item: string) => item.length > 0);
}

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
  ultra: "Ultra",
  maximum: "Maximum",
};

export function thinkingLevelLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return THINKING_LEVEL_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

export function thinkingLevelMessageKey(value: string): string | null {
  switch (value.trim().toLowerCase()) {
    case "off":
      return "off";
    case "none":
      return "none";
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
    case "extra_high":
      return "extraHigh";
    case "max":
      return "max";
    case "ultra":
      return "ultra";
    case "maximum":
      return "maximum";
    default:
      return null;
  }
}

function compactConfigId(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]/g, "");
}

export function permissionModeMessageKey(value: string): string | null {
  switch (compactConfigId(value)) {
    case "yolo":
    case "bypasspermissions":
    case "dontask":
    case "never":
    case "allow":
    case "alwaysapprove":
      return "yolo";
    case "acceptedits":
      return "acceptEdits";
    case "auto":
      return "auto";
    case "askalways":
    case "default":
    case "ask":
    case "onrequest":
    case "manual":
      return "askAlways";
    default:
      return null;
  }
}

export function configPickerGroupMessageKey(id: string): string | null {
  switch (id) {
    case "permission_mode":
      return "permissionMode";
    case "mode":
      return "mode";
    case "model":
      return "model";
    case "thinking":
      return "thinking";
    default:
      return null;
  }
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
  return thinkingChoicesFromSupport(thinking);
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
  permissionModeId = "",
): AgentConfigOption[] {
  if (!catalog) return [];
  const options: AgentConfigOption[] = [];
  const permissionModes = catalog.permission_modes ?? [];
  if (permissionModes.length > 0) {
    const defaultPermissionMode =
      permissionModes.find((mode) => mode.is_default)?.id || permissionModes[0]?.id || "";
    options.push({
      id: "permission_mode",
      name: "Permission mode",
      type: "select",
      currentValue: permissionModeId || defaultPermissionMode,
      options: permissionModes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
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
      : kind === "permission_mode"
        ? ["permission_mode", "permission_modes"]
        : kind === "mode"
          ? ["mode", "modes"]
          : [kind];
  const needle = id.trim().toLowerCase();
  const cat = category?.trim().toLowerCase() ?? "";
  return aliases.some((alias) => needle === alias || cat === alias);
}

export function overlayPendingConfigValues(
  options: AgentConfigOption[],
  pending: { modelId?: string; modeId?: string; thinkingId?: string; permissionModeId?: string },
): AgentConfigOption[] {
  return options.map((option) => {
    const pendingValue = configKindMatches(option.id, option.category, "model")
      ? pending.modelId
      : configKindMatches(option.id, option.category, "permission_mode")
        ? pending.permissionModeId
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

export function composerConfigOptions(args: {
  descriptor: AgentDescriptor | null | undefined;
  catalog: AgentModelCatalog | null;
  providerId: string;
  modelId: string;
  thinkingId: string;
  modeId: string;
  permissionModeId: string;
}): AgentConfigOption[] {
  const matched = descriptorForComposerProvider(args.descriptor, args.providerId);
  const filled = matched
    ? fillEmptyDescriptorOptionsFromCatalog(matched, args.catalog)
    : null;
  const base = filled
    ? descriptorToConfigOptions(filled, args.modelId)
    : catalogToConfigOptions(
        args.catalog,
        args.modelId,
        args.thinkingId,
        args.modeId,
        args.permissionModeId,
      );
  return overlayPendingConfigValues(base, {
    modelId: args.modelId,
    modeId: args.modeId,
    thinkingId: args.thinkingId,
    permissionModeId: args.permissionModeId,
  });
}

export function displayedComposerConfigValue(
  options: AgentConfigOption[],
  kind: "model" | "thinking" | "mode" | "permission_mode",
  selected = "",
): string {
  const option = options.find((item) => configKindMatches(item.id, item.category, kind));
  const trimmed = selected.trim();
  if (kind !== "model") {
    const listed = option?.options.map((item) => item.value) ?? [];
    if (trimmed && listed.includes(trimmed)) return trimmed;
    const current = option?.currentValue?.trim() || "";
    if (current && listed.includes(current)) return current;
    return listed[0] || "";
  }
  if (trimmed) return trimmed;
  return option?.currentValue?.trim() || "";
}

function thinkingSupportIsEmpty(
  thinking: AgentThinkingSupport | { type?: string; options?: string[] } | null | undefined,
): boolean {
  if (!thinking || thinking.type === "none") return true;
  if (thinking.type === "enum") return !thinking.options?.some((item) => item.trim());
  return false;
}

export function descriptorForComposerProvider(
  descriptor: AgentDescriptor | null | undefined,
  providerId: string,
): AgentDescriptor | null {
  if (!descriptor) return null;
  const id = providerId.trim();
  if (!id) return descriptor;
  return descriptor.identity.id === id ? descriptor : null;
}

export function fillEmptyDescriptorOptionsFromCatalog(
  descriptor: AgentDescriptor,
  catalog: AgentModelCatalog | null,
): AgentDescriptor {
  if (!catalog || catalog.status !== "ok") return descriptor;
  if (catalog.agent_id !== descriptor.identity.id) return descriptor;
  const options = descriptor.supported_options;
  const models = overlayCatalogModelThinking(
    options.models.length > 0 ? options.models : catalog.models,
    catalog.models,
  );
  const modes = (options.modes?.length ?? 0) > 0 ? options.modes : catalog.modes;
  const permissionModes =
    (options.permission_modes?.length ?? 0) > 0
      ? options.permission_modes
      : catalog.permission_modes;
  const thinking =
    thinkingSupportIsEmpty(options.thinking) && !thinkingSupportIsEmpty(catalog.thinking)
      ? catalog.thinking
      : options.thinking;
  if (
    models === options.models
    && modes === options.modes
    && permissionModes === options.permission_modes
    && thinking === options.thinking
  ) {
    return descriptor;
  }
  return {
    ...descriptor,
    supported_options: {
      ...options,
      models,
      modes: modes ?? [],
      permission_modes: permissionModes,
      thinking: thinking ?? { type: "none" },
    },
  };
}

function overlayCatalogModelThinking<T extends { id: string; thinking?: AgentThinkingSupport | null }>(
  models: T[],
  catalogModels: T[],
): T[] {
  if (models.length === 0 || catalogModels.length === 0) return models;
  let changed = false;
  const next = models.map((model) => {
    const catalogModel = catalogModels.find((item) => item.id === model.id);
    const overlay = catalogThinkingToOverlay(catalogModel?.thinking);
    if (overlay === undefined) return model;
    if (sameThinking(model.thinking, overlay)) return model;
    changed = true;
    return { ...model, thinking: overlay };
  });
  return changed ? next : models;
}

function catalogThinkingToOverlay(
  thinking: AgentThinkingSupport | { type?: string; options?: string[] } | null | undefined,
): AgentThinkingSupport | undefined {
  if (!thinking) return undefined;
  if (thinking.type === "none") return thinking as AgentThinkingSupport;
  if (!thinkingSupportIsEmpty(thinking)) return thinking as AgentThinkingSupport;
  return undefined;
}

function sameThinking(
  left: AgentThinkingSupport | { type?: string; options?: string[] } | null | undefined,
  right: AgentThinkingSupport | { type?: string; options?: string[] } | null | undefined,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function optionSupportEnabled(
  support: AgentOptionSupport | undefined,
  key: keyof AgentOptionSupport,
): boolean {
  return support?.[key] === "supported";
}

export function descriptorToConfigOptions(
  descriptor: AgentDescriptor,
  selectedModelId = "",
): AgentConfigOption[] {
  const options: AgentConfigOption[] = [];
  const support = descriptor.support;
  const permissionModes = descriptor.supported_options.permission_modes ?? [];
  const modes = descriptor.supported_options.modes ?? [];
  const models = descriptor.supported_options.models;
  const current = descriptor.current_config;
  if (optionSupportEnabled(support, "permission_modes") && permissionModes.length > 0) {
    const defaultPermissionMode =
      permissionModes.find((mode) => mode.is_default)?.id || permissionModes[0]?.id || "";
    options.push({
      id: "permission_mode",
      name: "Permission mode",
      type: "select",
      currentValue: current.permission_mode || defaultPermissionMode,
      options: permissionModes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  if (optionSupportEnabled(support, "modes") && modes.length > 0) {
    const defaultMode = modes.find((mode) => mode.is_default)?.id || modes[0]?.id || "";
    options.push({
      id: "mode",
      name: "Mode",
      type: "select",
      currentValue: current.mode || defaultMode,
      options: modes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  if (optionSupportEnabled(support, "models") && models.length > 0) {
    const selected = selectedModelId.trim();
    const modelId = selected
      && models.some((model) => model.id === selected)
      ? selected
      : current.model
        && models.some((model) => model.id === current.model)
        ? current.model
        : (models.find((model) => model.is_default)?.id || models[0]?.id || "");
    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: modelId,
      options: models.map((model) => ({
        value: model.id,
        name: model.label || model.id,
      })),
    });
    if (optionSupportEnabled(support, "thinking")) {
      const thinking = descriptorThinkingChoices(descriptor, modelId);
      if (thinking.length > 0) {
        options.push({
          id: "thinking",
          name: "Thinking",
          type: "select",
          currentValue:
            (current.thinking && thinking.includes(current.thinking) ? current.thinking : thinking[0]) || "",
          options: thinking.map((value) => ({
            value,
            name: thinkingLevelLabel(value),
          })),
        });
      }
    }
  }
  return options;
}

function descriptorThinkingChoices(descriptor: AgentDescriptor, modelId: string): string[] {
  const model = descriptor.supported_options.models.find((item) => item.id === modelId);
  const perModel = model?.thinking;
  if (perModel && perModel.type === "none") return [];
  const listed = thinkingChoicesFromSupport(perModel);
  if (listed.length > 0) return listed;
  return thinkingChoicesFromSupport(descriptor.supported_options.thinking);
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
