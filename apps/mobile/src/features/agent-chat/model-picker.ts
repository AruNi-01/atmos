import type { AgentOptionsSnapshot, AgentThinkingSupport } from "@atmos/api-types/ws/dto/agent-chat";
import { thinkingLevelLabel } from "./option-controls";

export type PickerChoice = { id: string; label: string };

export type PickerAgent = { id: string; label: string; iconUrl: string | null };

export type PickerModelRow = {
  id: string;
  label: string;
  group: string;
  multiplier: string;
  fast: boolean;
};

export type FavoriteModel = {
  agentId: string;
  model: string;
  label: string;
};

export type ComposerPicker = {
  agents: PickerAgent[];
  agentId: string;
  agentLabel: string;
  agentIconUrl: string | null;
  models: PickerModelRow[];
  modelId: string;
  modelLabel: string;
  thinking: PickerChoice[];
  thinkingId: string;
  thinkingLabel: string;
  fastAvailable: boolean;
  fastEnabled: boolean;
  context: PickerChoice[];
  contextId: string;
  modes: PickerChoice[];
  modeId: string;
  modeLabel: string;
  permissions: PickerChoice[];
  permissionId: string;
  permissionLabel: string;
  triggerLabel: string;
  effortLabel: string;
};

export type ComposerPatch = {
  agentId?: string;
  modelId?: string;
  thinkingId?: string;
  modeId?: string;
  permissionId?: string;
  fastEnabled?: boolean;
  contextId?: string;
};

const FAVORITES_TAB = "__favorites__";

export function favoritesTabId(): string {
  return FAVORITES_TAB;
}

export function isFastOn(value: string | null | undefined): boolean {
  const token = (value ?? "").trim().toLowerCase();
  return token === "true" || token === "on" || token === "1" || token === "yes";
}

export function fastWireValue(enabled: boolean): "true" | "false" {
  return enabled ? "true" : "false";
}

function listed(items: Array<{ id: string; label: string }> | null | undefined): PickerChoice[] {
  const choices: PickerChoice[] = [];
  const seen = new Set<string>();
  for (const item of items ?? []) {
    const id = item.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    choices.push({ id, label: item.label.trim() || id });
  }
  return choices;
}

function thinkingChoices(thinking: AgentThinkingSupport | null | undefined): PickerChoice[] {
  if (!thinking || thinking.type !== "enum") return [];
  return listed(thinking.options.map((option) => ({ id: option, label: thinkingLevelLabel(option) })));
}

function choiceLabel(choices: PickerChoice[], selectedId: string): string {
  if (!selectedId) return "";
  return choices.find((choice) => choice.id === selectedId)?.label ?? thinkingLevelLabel(selectedId);
}

export function composerTriggerLabel(input: {
  modelLabel: string;
  thinkingLabel: string;
  agentLabel: string;
}): string {
  const model = input.modelLabel.trim();
  const thinking = input.thinkingLabel.trim();
  const agent = input.agentLabel.trim();
  if (model && thinking) return `${model} · ${thinking}`;
  return model || thinking || agent;
}

export function effortChipLabel(thinkingLabel: string, fastEnabled: boolean): string {
  const thinking = thinkingLabel.trim();
  if (thinking && fastEnabled) return `${thinking} · Fast`;
  if (thinking) return thinking;
  return fastEnabled ? "Fast" : "";
}

export function favoriteModelsFromUnknown(value: unknown): FavoriteModel[] {
  if (!Array.isArray(value)) return [];
  const next: FavoriteModel[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { agent_id?: unknown; model?: unknown; label?: unknown };
    const agentId = typeof row.agent_id === "string" ? row.agent_id.trim() : "";
    const model = typeof row.model === "string" ? row.model.trim() : "";
    if (!agentId || !model) continue;
    const key = `${agentId}\u001f${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : model;
    next.push({ agentId, model, label });
  }
  return next;
}

export function toggleFavoriteModel(favorites: readonly FavoriteModel[], entry: FavoriteModel): FavoriteModel[] {
  const agentId = entry.agentId.trim();
  const model = entry.model.trim();
  if (!agentId || !model) return [...favorites];
  const key = `${agentId}\u001f${model}`;
  if (favorites.some((item) => `${item.agentId}\u001f${item.model}` === key)) {
    return favorites.filter((item) => `${item.agentId}\u001f${item.model}` !== key);
  }
  return [...favorites, { agentId, model, label: entry.label.trim() || model }];
}

export function isFavoriteModel(favorites: readonly FavoriteModel[], agentId: string, model: string): boolean {
  const key = `${agentId.trim()}\u001f${model.trim()}`;
  return favorites.some((item) => `${item.agentId}\u001f${item.model}` === key);
}

export type GroupedModelRow =
  | { type: "header"; label: string }
  | { type: "option"; option: PickerModelRow };

export function groupedModelRows(models: PickerModelRow[]): GroupedModelRow[] {
  const hasGroup = models.some((item) => item.group.trim().length > 0);
  if (!hasGroup) return models.map((option) => ({ type: "option", option }));
  const ungrouped: PickerModelRow[] = [];
  const grouped = new Map<string, PickerModelRow[]>();
  const order: string[] = [];
  for (const option of models) {
    const group = option.group.trim();
    if (!group) {
      ungrouped.push(option);
      continue;
    }
    const bucket = grouped.get(group);
    if (bucket) {
      bucket.push(option);
      continue;
    }
    order.push(group);
    grouped.set(group, [option]);
  }
  const rows: GroupedModelRow[] = ungrouped.map((option) => ({ type: "option", option }));
  for (const label of order) {
    rows.push({ type: "header", label });
    for (const option of grouped.get(label) ?? []) rows.push({ type: "option", option });
  }
  return rows;
}

function compactId(value: string): string {
  return value.trim().toLowerCase().replace(/[-_\s]/g, "");
}

export function modeIconKind(value: string): "plan" | "build" | "ask" | "code" | "chat" | "layers" {
  switch (compactId(value)) {
    case "plan":
    case "spec":
      return "plan";
    case "build":
      return "build";
    case "code":
      return "code";
    case "ask":
      return "ask";
    case "auto":
    case "default":
    case "normal":
    case "agent":
      return "chat";
    default:
      return "layers";
  }
}

export function permissionIconKind(value: string): "yolo" | "edits" | "auto" | "ask" | "shield" {
  switch (compactId(value)) {
    case "yolo":
    case "bypasspermissions":
    case "dontask":
    case "alwaysapprove":
      return "yolo";
    case "acceptedits":
    case "autolow":
      return "edits";
    case "auto":
    case "automedium":
    case "autohigh":
      return "auto";
    case "askalways":
    case "default":
    case "ask":
    case "manual":
      return "ask";
    default:
      return "shield";
  }
}

export function buildComposerPicker(input: {
  agents: PickerAgent[];
  agentId: string | null;
  options: AgentOptionsSnapshot | null;
  modelId: string | null;
  thinkingId: string | null;
  modeId: string | null;
  permissionId: string | null;
  fastId: string | null;
  contextId: string | null;
}): ComposerPicker {
  const agentId = input.agentId?.trim() || input.agents[0]?.id || "";
  const agent = input.agents.find((item) => item.id === agentId) ?? null;
  const fastEnabled = isFastOn(input.fastId);
  const models: PickerModelRow[] = (input.options?.models ?? []).flatMap((model) => {
    const id = model.id.trim();
    if (!id) return [];
    const multiplier = fastEnabled && model.fast_multiplier?.trim()
      ? model.fast_multiplier.trim()
      : (model.multiplier?.trim() ?? "");
    return [{
      id,
      label: model.label.trim() || id,
      group: model.group?.trim() ?? "",
      multiplier,
      fast: Boolean(model.fast),
    }];
  });
  const requestedModel = input.modelId?.trim() ?? "";
  const defaultModel = input.options?.models.find((model) => model.is_default)?.id?.trim()
    || models[0]?.id
    || "";
  const modelId = models.some((model) => model.id === requestedModel) ? requestedModel : defaultModel;
  const selected = input.options?.models.find((model) => model.id === modelId) ?? null;
  const thinking = thinkingChoices(
    selected?.thinking?.type === "enum" ? selected.thinking : input.options?.thinking,
  );
  const thinkingId = input.thinkingId?.trim() && thinking.some((item) => item.id === input.thinkingId)
    ? input.thinkingId.trim()
    : (thinking[0]?.id ?? "");
  const modelContext = listed(selected?.context);
  const context = modelContext.length > 1 ? modelContext : listed(input.options?.context);
  const contextId = input.contextId?.trim() && context.some((item) => item.id === input.contextId)
    ? input.contextId.trim()
    : (context.find((item) => item.id)?.id ?? "");
  const modes = listed(input.options?.modes);
  const modeId = input.modeId?.trim() && modes.some((item) => item.id === input.modeId)
    ? input.modeId.trim()
    : (modes.find((item) => input.options?.modes.find((mode) => mode.is_default)?.id === item.id)?.id ?? modes[0]?.id ?? "");
  const permissions = listed(input.options?.permission_modes);
  const permissionId = input.permissionId?.trim() && permissions.some((item) => item.id === input.permissionId)
    ? input.permissionId.trim()
    : (permissions[0]?.id ?? "");
  const modelLabel = models.find((model) => model.id === modelId)?.label ?? "";
  const thinkingLabel = choiceLabel(thinking, thinkingId);
  const agentLabel = agent?.label ?? "";
  return {
    agents: input.agents,
    agentId,
    agentLabel,
    agentIconUrl: agent?.iconUrl ?? null,
    models,
    modelId,
    modelLabel,
    thinking,
    thinkingId,
    thinkingLabel,
    fastAvailable: Boolean(selected?.fast),
    fastEnabled,
    context: context.length > 1 ? context : [],
    contextId: context.length > 1 ? contextId : "",
    modes,
    modeId,
    modeLabel: choiceLabel(modes, modeId),
    permissions,
    permissionId,
    permissionLabel: choiceLabel(permissions, permissionId),
    triggerLabel: composerTriggerLabel({ modelLabel, thinkingLabel, agentLabel }),
    effortLabel: effortChipLabel(thinkingLabel, fastEnabled && Boolean(selected?.fast)),
  };
}
