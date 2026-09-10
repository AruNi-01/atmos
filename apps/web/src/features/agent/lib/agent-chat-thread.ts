import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import type { AgentConfigOption, AgentPlan } from "@/features/agent/lib/agent-chat-types";
import type { AgentOptionsSnapshot } from "@/api/ws/agent-chat-api";
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
  return sortThinkingLevels(
    options.map((item: string) => item.trim()).filter((item: string) => item.length > 0),
  );
}

/** Weakest → strongest so the Effort slider puts Extra high on the right. */
function sortThinkingLevels(options: string[]): string[] {
  return options
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rankDelta = thinkingLevelRank(left.item) - thinkingLevelRank(right.item);
      return rankDelta !== 0 ? rankDelta : left.index - right.index;
    })
    .map((entry) => entry.item);
}

function thinkingLevelRank(level: string): number {
  switch (level.trim().toLowerCase().replace(/[-_\s]/g, "")) {
    case "off":
    case "none":
      return 0;
    case "auto":
      return 1;
    case "minimal":
      return 2;
    case "low":
      return 3;
    case "medium":
    case "med":
      return 4;
    case "high":
      return 5;
    case "xhigh":
    case "extrahigh":
      return 6;
    case "max":
    case "maximum":
      return 7;
    case "ultra":
      return 8;
    default:
      return 100;
  }
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

export function thinkingChoices(catalog: AgentOptionsSnapshot | null, modelId: string): string[] {
  const models = catalog?.models ?? [];
  const model = models.find((item) => item.id === modelId);
  const perModel = model?.thinking as ThinkingShape | undefined;
  if (perModel && perModel.type === "none") return [];
  const listed = choicesFromThinking(perModel);
  if (listed.length > 0) return listed;
  // ACP session effort is model-scoped. Once any model has its own ladder (or an
  // explicit none), do not reuse the agent-level list for unknown models.
  if (modelsHavePerModelThinking(models)) return [];
  return choicesFromThinking(catalog?.thinking as ThinkingShape | undefined);
}

export type AgentContextChoice = {
  id: string;
  label: string;
  is_default?: boolean;
};

export function contextChoices(
  catalog: AgentOptionsSnapshot | null,
  modelId: string,
): AgentContextChoice[] {
  return contextChoicesForModels(catalog?.models, catalog?.context, modelId);
}

export function contextChoicesForModels(
  models: Array<{ id: string; context?: AgentContextChoice[] | null }> | null | undefined,
  agentContext: AgentContextChoice[] | null | undefined,
  modelId: string,
): AgentContextChoice[] {
  const list = models ?? [];
  const model = list.find((item) => item.id === modelId);
  const perModel = model?.context ?? [];
  if (perModel.length >= 2) return perModel;
  if (list.some((item) => (item.context?.length ?? 0) >= 2)) return [];
  const agentLevel = agentContext ?? [];
  return agentLevel.length >= 2 ? agentLevel : [];
}

export function defaultContextChoiceId(choices: AgentContextChoice[]): string {
  return choices.find((item) => item.is_default)?.id || choices[0]?.id || "";
}

function compactContextId(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]/g, "");
}

function contextChoiceIs1M(choice: AgentContextChoice | undefined): boolean {
  if (!choice) return false;
  return compactContextId(choice.id) === "1m" || choice.label.trim().toUpperCase() === "1M";
}

export function selectedContextIs1M(
  contextId: string | null | undefined,
  choices: AgentContextChoice[],
): boolean {
  const token = compactContextId(contextId ?? "");
  if (token === "1m") return true;
  return contextChoiceIs1M(choices.find((item) => item.id === contextId));
}

/** Append the 1M chip to the selected model name when that context is on. */
export function modelPickerName(
  label: string,
  id: string,
  selectedId: string,
  contextId: string | null | undefined,
  contextChoices: AgentContextChoice[],
): string {
  const base = label.trim() || id;
  if (id !== selectedId || !selectedContextIs1M(contextId, contextChoices)) return base;
  const suffix = contextChoices.find((item) => item.id === contextId)?.label.trim() || "1M";
  if (base.endsWith(` ${suffix}`)) return base;
  return `${base} ${suffix}`;
}

function booleanFastModes(defaultOn = false): Array<{ id: string; label: string; is_default?: boolean }> {
  return [
    { id: "false", label: "Off", is_default: !defaultOn },
    { id: "true", label: "On", is_default: defaultOn },
  ];
}

export function selectedModelSupportsFast(
  models: Array<{ id: string; fast?: boolean | null }> | null | undefined,
  modelId: string,
  sessionFast: Array<unknown> | null | undefined,
): boolean {
  const list = models ?? [];
  const model = list.find((item) => item.id === modelId);
  if (model?.fast) return true;
  if (list.some((item) => item.fast)) return false;
  return (sessionFast?.length ?? 0) > 0;
}

function modelsHavePerModelThinking(
  models: Array<{ thinking?: AgentThinkingSupport | ThinkingShape | null }>,
): boolean {
  return models.some((model) => model.thinking != null);
}

export function isOptionsModelsLoading(
  catalog: AgentOptionsSnapshot | null | undefined,
  providerId: string,
): boolean {
  if (!providerId.trim()) return false;
  if (!catalog) return true;
  if (catalog.agent_id && catalog.agent_id !== providerId) return true;
  // Usable lists stay interactive while a background revalidate is in flight.
  if (catalog.models.length > 0) return false;
  return catalog.status === "probing";
}

export function probingOptionsSnapshot(agentId: string): AgentOptionsSnapshot {
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

export function defaultOptionsModelId(
  catalog: AgentOptionsSnapshot | null | undefined,
  currentId = "",
): string {
  if (!catalog || catalog.models.length === 0) return currentId;
  if (currentId && catalog.models.some((model) => model.id === currentId)) {
    return currentId;
  }
  return catalog.models.find((model) => model.is_default)?.id || catalog.models[0]?.id || "";
}

export function optionsSnapshotToConfigOptions(
  catalog: AgentOptionsSnapshot | null,
  modelId: string,
  thinkingId: string,
  modeId = "",
  permissionModeId = "",
  contextId = "",
  fastId = "",
): AgentConfigOption[] {
  if (!catalog) return [];
  const options: AgentConfigOption[] = [];
  const permissionModes = catalog.permission_modes ?? [];
  if (permissionModes.length > 0) {
    const listed = permissionModes.map((mode) => mode.id);
    const defaultPermissionMode =
      permissionModes.find((mode) => mode.is_default)?.id
      || defaultListedConfigValue(listed, "permission_mode");
    options.push({
      id: "permission_mode",
      name: "Permission mode",
      type: "select",
      currentValue:
        matchListedConfigValue(listed, permissionModeId, "permission_mode")
        || defaultPermissionMode,
      options: permissionModes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  if (catalog.modes.length > 0) {
    const listed = catalog.modes.map((mode) => mode.id);
    const defaultMode =
      catalog.modes.find((mode) => mode.is_default)?.id || listed[0] || "";
    options.push({
      id: "mode",
      name: "Mode",
      type: "select",
      currentValue: matchListedConfigValue(listed, modeId, "mode") || defaultMode,
      options: catalog.modes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  const resolvedModelId = defaultOptionsModelId(catalog, modelId);
  const context = contextChoices(catalog, resolvedModelId);
  const resolvedContextId = context.length >= 2
    ? (matchListedConfigValue(context.map((item) => item.id), contextId, "context")
      || defaultContextChoiceId(context))
    : "";
  if (catalog.models.length > 0) {
    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: resolvedModelId,
      options: catalog.models.map((model) => ({
        value: model.id,
        name: modelPickerName(
          model.label || model.id,
          model.id,
          resolvedModelId,
          resolvedContextId,
          context,
        ),
        ...(model.group?.trim() ? { group: model.group.trim() } : {}),
        ...(model.multiplier?.trim() ? { multiplier: model.multiplier.trim() } : {}),
        ...(model.fast_multiplier?.trim()
          ? { fastMultiplier: model.fast_multiplier.trim() }
          : {}),
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
  if (context.length >= 2) {
    options.push({
      id: "context",
      name: "Context",
      type: "select",
      currentValue: resolvedContextId,
      options: context.map((item) => ({
        value: item.id,
        name: item.label || item.id,
      })),
    });
  }
  if (selectedModelSupportsFast(catalog.models, resolvedModelId, [])) {
    const fastModes = booleanFastModes();
    const listedFast = new Set(fastModes.map((mode) => mode.id));
    const defaultFast = fastModes.find((mode) => mode.is_default)?.id || fastModes[0]?.id || "";
    options.push({
      id: "fast",
      name: "Fast",
      type: "select",
      currentValue: (fastId && listedFast.has(fastId) ? fastId : defaultFast),
      options: fastModes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  return options;
}

export function configKindMatches(id: string, category: string | null | undefined, kind: string): boolean {
  if (kind === "thinking") return isThinkingConfigId(id, category);
  if (kind === "fast") {
    const needle = id.trim().toLowerCase();
    const cat = category?.trim().toLowerCase() ?? "";
    return ["fast", "fast-mode", "fast_mode", "fastmode"].some(
      (alias) => needle === alias || cat === alias,
    );
  }
  if (kind === "context") {
    const needle = id.trim().toLowerCase();
    const cat = category?.trim().toLowerCase() ?? "";
    return ["context", "context_window", "contextwindow"].some(
      (alias) => needle === alias || cat === alias,
    );
  }
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
  pending: {
    modelId?: string;
    modeId?: string;
    thinkingId?: string;
    permissionModeId?: string;
    fastId?: string;
    contextId?: string;
  },
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
            : configKindMatches(option.id, option.category, "fast")
              ? pending.fastId
              : configKindMatches(option.id, option.category, "context")
                ? pending.contextId
                : undefined;
    const trimmed = pendingValue?.trim();
    if (!trimmed) return option;
    const listed = option.options.map((item) => item.value);
    const kind = configKindMatches(option.id, option.category, "permission_mode")
      ? "permission_mode" as const
      : configKindMatches(option.id, option.category, "mode")
        ? "mode" as const
        : configKindMatches(option.id, option.category, "thinking")
          ? "thinking" as const
          : configKindMatches(option.id, option.category, "fast")
            ? "fast" as const
            : configKindMatches(option.id, option.category, "context")
              ? "context" as const
              : null;
    if (kind) {
      const matched = matchListedConfigValue(listed, trimmed, kind);
      if (matched) return { ...option, currentValue: matched };
      return option;
    }
    if (listed.includes(trimmed)) {
      return { ...option, currentValue: trimmed };
    }
    return option;
  });
}

export function composerConfigOptions(args: {
  descriptor: AgentDescriptor | null | undefined;
  catalog: AgentOptionsSnapshot | null;
  providerId: string;
  modelId: string;
  thinkingId: string;
  modeId: string;
  permissionModeId: string;
  fastId?: string;
  contextId?: string;
}): AgentConfigOption[] {
  const matched = descriptorForComposerProvider(args.descriptor, args.providerId);
  const filled = matched
    ? fillEmptyDescriptorOptionsFromSnapshot(matched, args.catalog)
    : null;
  const base = filled
    ? descriptorToConfigOptions(filled, args.modelId, args.contextId)
    : optionsSnapshotToConfigOptions(
        args.catalog,
        args.modelId,
        args.thinkingId,
        args.modeId,
        args.permissionModeId,
        args.contextId,
        args.fastId,
      );
  return overlayPendingConfigValues(base, {
    modelId: args.modelId,
    modeId: args.modeId,
    thinkingId: args.thinkingId,
    permissionModeId: args.permissionModeId,
    fastId: args.fastId,
    contextId: args.contextId,
  });
}

export function displayedComposerConfigValue(
  options: AgentConfigOption[],
  kind: "model" | "thinking" | "mode" | "permission_mode" | "fast" | "context",
  selected = "",
): string {
  const option = options.find((item) => configKindMatches(item.id, item.category, kind));
  const listed = option?.options.map((item) => item.value) ?? [];
  if (kind === "model") {
    const trimmed = selected.trim();
    if (trimmed) return trimmed;
    return option?.currentValue?.trim() || "";
  }
  const fromSelected = matchListedConfigValue(listed, selected, kind);
  if (fromSelected) return fromSelected;
  const fromCurrent = matchListedConfigValue(
    listed,
    option?.currentValue ?? "",
    kind,
  );
  if (fromCurrent) return fromCurrent;
  return defaultListedConfigValue(listed, kind);
}

/**
 * Exact match, or permission vendor alias → Atmos id (e.g. `default` → `ask_always`).
 * Mode / thinking / fast stay agent-native ids — no cross-agent remapping.
 */
function matchListedConfigValue(
  listed: string[],
  candidate: string,
  kind: "thinking" | "mode" | "permission_mode" | "fast" | "context",
): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (listed.includes(trimmed)) return trimmed;
  if (kind !== "permission_mode") return null;
  const key = permissionModeMessageKey(trimmed);
  if (!key) return null;
  return listed.find((item) => permissionModeMessageKey(item) === key) ?? null;
}

/** Prefer Atmos Ask always for permission; otherwise the first listed id. */
function defaultListedConfigValue(
  listed: string[],
  kind: "thinking" | "mode" | "permission_mode" | "fast" | "context",
): string {
  if (kind === "permission_mode") {
    const askAlways = listed.find((item) => permissionModeMessageKey(item) === "askAlways");
    if (askAlways) return askAlways;
  }
  return listed[0] || "";
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

export function fillEmptyDescriptorOptionsFromSnapshot(
  descriptor: AgentDescriptor,
  catalog: AgentOptionsSnapshot | null,
): AgentDescriptor {
  if (!catalog || catalog.status !== "ok") return descriptor;
  if (catalog.agent_id !== descriptor.identity.id) return descriptor;
  const options = descriptor.supported_options;
  const isCursor =
    catalog.agent_id === "cursor" || descriptor.identity.id === "cursor";
  // Cursor PMP catalog is bare models + separate effort/fast. Older sessions keep a
  // CLI-encoded exploded list (`gpt-5.3-codex-low-fast`, thinking=encoded_in_model)
  // or stamp boolean `thinking` ahead of select `effort`. Prefer the catalog then.
  // Shape heuristics are Cursor-scoped — do not apply to other ACP agents.
  const preferCatalogModels =
    isCursor
    && catalog.models.length > 0
    && (
      options.models.length === 0
      || (
        modelsLookLikeCursorCliEncoded(options.models)
        && !modelsLookLikeCursorCliEncoded(catalog.models)
      )
      || (
        thinkingIsEncodedInModel(options.thinking)
        && !thinkingIsEncodedInModel(catalog.thinking)
        && !thinkingSupportIsEmpty(catalog.thinking)
      )
    );
  const preferCatalogThinking =
    !thinkingSupportIsEmpty(catalog.thinking)
    && (
      preferCatalogModels
      || (
        isCursor
        && (
          thinkingIsEncodedInModel(options.thinking)
          || (
            thinkingLooksLikeBooleanOnly(options.thinking)
            && !thinkingLooksLikeBooleanOnly(catalog.thinking)
          )
        )
      )
      || (
        thinkingSupportIsEmpty(options.thinking)
      )
    );
  const models = overlayCatalogModelLabels(
    overlayCatalogModelFast(
      overlayCatalogModelContext(
        overlayCatalogModelThinking(
          preferCatalogModels
            ? catalog.models
            : options.models.length > 0
              ? options.models
              : catalog.models,
          catalog.models,
        ),
        catalog.models,
      ),
      catalog.models,
    ),
    catalog.models,
  );
  const modes = (options.modes?.length ?? 0) > 0 ? options.modes : catalog.modes;
  const permissionModes = preferRicherPermissionModes(
    (options.permission_modes?.length ?? 0) > 0
      ? options.permission_modes
      : catalog.permission_modes,
    catalog.permission_modes,
  );
  const thinking =
    preferCatalogThinking
      ? catalog.thinking
      : thinkingSupportIsEmpty(options.thinking) && !thinkingSupportIsEmpty(catalog.thinking)
        ? catalog.thinking
        : options.thinking;
  if (
    models === options.models
    && modes === options.modes
    && permissionModes === options.permission_modes
    && thinking === options.thinking
    && !preferCatalogModels
    && !preferCatalogThinking
  ) {
    return descriptor;
  }
  const fast =
    (options.fast?.length ?? 0) > 0
      ? options.fast
      : models.some((model) => model.fast)
        ? booleanFastModes()
        : [];
  return {
    ...descriptor,
    supported_options: {
      ...options,
      models,
      modes: modes ?? [],
      permission_modes: permissionModes ?? [],
      thinking: thinking ?? { type: "none" },
      fast: fast ?? [],
      context: (options.context?.length ?? 0) >= 2
        ? options.context
        : catalog.context,
    },
  };
}

function thinkingIsEncodedInModel(
  thinking: AgentThinkingSupport | { type?: string; options?: string[] } | null | undefined,
): boolean {
  return thinking?.type === "encoded_in_model";
}

function thinkingLooksLikeBooleanOnly(
  thinking: AgentThinkingSupport | { type?: string; options?: string[] } | null | undefined,
): boolean {
  if (thinking?.type !== "enum") return false;
  const options = thinking.options ?? [];
  if (options.length === 0) return false;
  return options.every((value) => {
    const token = value.trim().toLowerCase();
    return token === "true" || token === "false" || token === "on" || token === "off" || token === "0" || token === "1";
  });
}

/** CLI-encoded Cursor variants: `gpt-5.3-codex-low-fast`, not bracket ACP ids. */
function modelsLookLikeCursorCliEncoded(
  models: Array<{ id: string }> | null | undefined,
): boolean {
  if (!models || models.length < 8) return false;
  const encoded = models.filter((model) => {
    const id = model.id.trim();
    if (!id || id.includes("[")) return false;
    return /-(?:low|medium|high|xhigh|extra-high|max|fast|thinking)(?:-|$)/i.test(id);
  }).length;
  return encoded >= Math.max(4, Math.floor(models.length / 4));
}

function overlayCatalogModelFast<
  T extends { id: string; fast?: boolean | null },
>(
  models: T[],
  catalogModels: T[],
): T[] {
  if (models.length === 0 || catalogModels.length === 0) return models;
  let changed = false;
  const next = models.map((model) => {
    if (model.fast) return model;
    const catalogModel = catalogModels.find((item) => item.id === model.id);
    if (!catalogModel?.fast) return model;
    changed = true;
    return { ...model, fast: true };
  });
  return changed ? next : models;
}

function overlayCatalogModelContext<
  T extends { id: string; context?: AgentContextChoice[] | null },
>(
  models: T[],
  catalogModels: T[],
): T[] {
  if (models.length === 0 || catalogModels.length === 0) return models;
  let changed = false;
  const next = models.map((model) => {
    if ((model.context?.length ?? 0) >= 2) return model;
    const catalogModel = catalogModels.find((item) => item.id === model.id);
    const overlay = catalogModel?.context ?? [];
    if (overlay.length < 2) return model;
    changed = true;
    return { ...model, context: overlay };
  });
  return changed ? next : models;
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

function overlayCatalogModelLabels<
  T extends {
    id: string;
    label?: string | null;
    group?: string | null;
    multiplier?: string | null;
    fast_multiplier?: string | null;
  },
>(
  models: T[],
  catalogModels: T[],
): T[] {
  if (models.length === 0 || catalogModels.length === 0) return models;
  let changed = false;
  const next = models.map((model) => {
    const catalogModel = catalogModels.find((item) => item.id === model.id);
    const catalogLabel = catalogModel?.label?.trim() ?? "";
    const catalogGroup = catalogModel?.group?.trim() ?? "";
    let nextModel = model;
    if (
      catalogLabel
      && !labelNeedsUpgrade(catalogLabel, catalogModel!.id)
      && labelNeedsUpgrade(model.label ?? "", model.id)
      && (model.label ?? "") !== catalogLabel
    ) {
      changed = true;
      nextModel = { ...nextModel, label: catalogLabel };
    }
    const liveGroup = nextModel.group?.trim() ?? "";
    if (!liveGroup && catalogGroup && nextModel.group !== catalogModel!.group) {
      changed = true;
      nextModel = { ...nextModel, group: catalogModel!.group };
    }
    const catalogMultiplier = catalogModel?.multiplier?.trim() || "";
    if (!nextModel.multiplier?.trim() && catalogMultiplier) {
      changed = true;
      nextModel = { ...nextModel, multiplier: catalogModel!.multiplier };
    }
    const catalogFastMultiplier = catalogModel?.fast_multiplier?.trim() || "";
    if (!nextModel.fast_multiplier?.trim() && catalogFastMultiplier) {
      changed = true;
      nextModel = { ...nextModel, fast_multiplier: catalogModel!.fast_multiplier };
    }
    return nextModel;
  });
  return changed ? next : models;
}

function labelNeedsUpgrade(label: string, id: string): boolean {
  const trimmed = label.trim();
  const modelId = id.trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase() === modelId.toLowerCase();
}

function preferRicherPermissionModes<T extends { id: string }>(
  live: T[] | null | undefined,
  catalog: T[] | null | undefined,
): T[] {
  const liveList = live ?? [];
  const catalogList = catalog ?? [];
  if (catalogList.length > liveList.length) return catalogList;
  return liveList;
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
  selectedContextId = "",
): AgentConfigOption[] {
  const options: AgentConfigOption[] = [];
  const support = descriptor.support;
  const permissionModes = descriptor.supported_options.permission_modes ?? [];
  const modes = descriptor.supported_options.modes ?? [];
  const models = descriptor.supported_options.models;
  const current = descriptor.current_config;
  if (optionSupportEnabled(support, "permission_modes") && permissionModes.length > 0) {
    const listed = permissionModes.map((mode) => mode.id);
    const defaultPermissionMode =
      permissionModes.find((mode) => mode.is_default)?.id
      || defaultListedConfigValue(listed, "permission_mode");
    options.push({
      id: "permission_mode",
      name: "Permission mode",
      type: "select",
      // Map vendor ids (e.g. Claude/Cursor `default`) onto Atmos listed ids.
      currentValue:
        matchListedConfigValue(listed, current.permission_mode || "", "permission_mode")
        || defaultPermissionMode,
      options: permissionModes.map((mode) => ({
        value: mode.id,
        name: mode.label || mode.id,
      })),
    });
  }
  if (optionSupportEnabled(support, "modes") && modes.length > 0) {
    const listed = modes.map((mode) => mode.id);
    const defaultMode = modes.find((mode) => mode.is_default)?.id || listed[0] || "";
    options.push({
      id: "mode",
      name: "Mode",
      type: "select",
      // Keep each agent's own mode ids; only fall back when current is missing/unknown.
      currentValue: matchListedConfigValue(listed, current.mode || "", "mode") || defaultMode,
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
    const context = contextChoicesForModels(
      models,
      descriptor.supported_options.context,
      modelId,
    );
    const resolvedContextId = context.length >= 2
      ? (matchListedConfigValue(
          context.map((item) => item.id),
          selectedContextId || current.context || "",
          "context",
        ) || defaultContextChoiceId(context))
      : "";
    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: modelId,
      options: models.map((model) => ({
        value: model.id,
        name: modelPickerName(
          model.label || model.id,
          model.id,
          modelId,
          resolvedContextId,
          context,
        ),
        ...(model.group?.trim() ? { group: model.group.trim() } : {}),
        ...(model.multiplier?.trim() ? { multiplier: model.multiplier.trim() } : {}),
        ...(model.fast_multiplier?.trim()
          ? { fastMultiplier: model.fast_multiplier.trim() }
          : {}),
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
    if (
      (optionSupportEnabled(support, "context") || context.length >= 2)
      && context.length >= 2
    ) {
      options.push({
        id: "context",
        name: "Context",
        type: "select",
        currentValue: resolvedContextId,
        options: context.map((item) => ({
          value: item.id,
          name: item.label || item.id,
        })),
      });
    }
    const sessionFast = descriptor.supported_options.fast ?? [];
    if (
      optionSupportEnabled(support, "fast")
      && selectedModelSupportsFast(models, modelId, sessionFast)
    ) {
      const fastModes = sessionFast.length > 0 ? sessionFast : booleanFastModes();
      const defaultFast = fastModes.find((mode) => mode.is_default)?.id || fastModes[0]?.id || "";
      const listedFast = new Set(fastModes.map((mode) => mode.id));
      const currentFast = current.fast?.trim() || "";
      options.push({
        id: "fast",
        name: "Fast",
        type: "select",
        currentValue: (currentFast && listedFast.has(currentFast) ? currentFast : defaultFast),
        options: fastModes.map((mode) => ({
          value: mode.id,
          name: mode.label || mode.id,
        })),
      });
    }
  }
  return options;
}

function descriptorThinkingChoices(descriptor: AgentDescriptor, modelId: string): string[] {
  const models = descriptor.supported_options.models;
  const model = models.find((item) => item.id === modelId);
  const perModel = model?.thinking;
  if (perModel && perModel.type === "none") return [];
  const listed = thinkingChoicesFromSupport(perModel);
  if (listed.length > 0) return listed;
  if (modelsHavePerModelThinking(models)) return [];
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

/** Tab label is max-w-[180px] (~16 CJK). Prompt fallback titles keep ~2× that. */
export const CHAT_PROMPT_TITLE_MAX_CHARS = 32;

export function chatTitleFromPrompt(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!line) return "";
  const chars = Array.from(line);
  if (chars.length <= CHAT_PROMPT_TITLE_MAX_CHARS) return line;
  return `${chars.slice(0, CHAT_PROMPT_TITLE_MAX_CHARS).join("")}…`;
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

function canonicalPlanStatus(value: string): "completed" | "in_progress" | "pending" | null {
  const compact = value.trim().toLowerCase().replace(/[\s-]/g, "_");
  if (compact === "completed") return "completed";
  if (compact === "in_progress" || compact === "inprogress") return "in_progress";
  if (compact === "pending") return "pending";
  return null;
}

/** Droid TodoWrite often encodes `[completed]` in content and leaves status pending. */
export function normalizePlanEntry(
  content: string,
  status: string,
): { content: string; status: string } {
  let text = content.trim();
  let inferred: "completed" | "in_progress" | "pending" | null = null;
  let strippedStatus = false;
  for (;;) {
    const tagged = text.match(/^\[(completed|in[_\s-]?progress|pending)\]\s*/i);
    if (tagged?.[1]) {
      inferred = canonicalPlanStatus(tagged[1]) ?? inferred;
      strippedStatus = true;
      text = text.slice(tagged[0].length);
      continue;
    }
    const broken = text.match(/^\[(completed|in[_\s-]?progress|pending)\s+(?=\d+\.|\[[^\]]+\])/i);
    if (broken?.[1]) {
      inferred = canonicalPlanStatus(broken[1]) ?? inferred;
      strippedStatus = true;
      text = text.slice(broken[0].length);
      continue;
    }
    if (strippedStatus) {
      const numbered = text.match(/^\d+\.\s+/);
      if (numbered) {
        text = text.slice(numbered[0].length);
        continue;
      }
    }
    break;
  }
  const current = canonicalPlanStatus(status) ?? "pending";
  const nextStatus =
    current === "pending" && (inferred === "completed" || inferred === "in_progress")
      ? inferred
      : status;
  return { content: text.trim() || content.trim(), status: nextStatus };
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
      const normalized = normalizePlanEntry(
        item.content,
        typeof item.status === "string" ? item.status : "pending",
      );
      return {
        content: normalized.content,
        priority: typeof item.priority === "string" ? item.priority : "medium",
        status: normalized.status,
      };
    })
    .filter((entry): entry is AgentPlan["entries"][number] => entry !== null);
  if (entries.length === 0) return null;
  return { entries };
}
