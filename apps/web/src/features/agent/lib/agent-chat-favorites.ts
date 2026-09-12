export const AGENT_CHAT_FAVORITES_TAB = "__favorites__";

export type AgentFavoriteModel = {
  agentId: string;
  model: string;
  label: string;
};

export function normalizeFavoriteModel(
  value: Partial<AgentFavoriteModel> | null | undefined,
): AgentFavoriteModel | null {
  const agentId = value?.agentId?.trim() ?? "";
  const model = value?.model?.trim() ?? "";
  if (!agentId || !model) return null;
  const label = value?.label?.trim() || model;
  return { agentId, model, label };
}

export function parseFavoriteModels(value: unknown): AgentFavoriteModel[] {
  if (!Array.isArray(value)) return [];
  const next: AgentFavoriteModel[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const parsed = normalizeFavoriteModel(entry as Partial<AgentFavoriteModel>);
    if (!parsed) continue;
    const key = favoriteModelKey(parsed.agentId, parsed.model);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(parsed);
  }
  return next;
}

export type AgentFavoriteModelWire = {
  agent_id: string;
  model: string;
  label?: string | null;
};

export function favoriteModelsFromWire(value: unknown): AgentFavoriteModel[] {
  if (!Array.isArray(value)) return [];
  return parseFavoriteModels(
    value.map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as AgentFavoriteModelWire;
      return {
        agentId: row.agent_id,
        model: row.model,
        label: row.label ?? "",
      };
    }),
  );
}

export function favoriteModelsToWire(
  favorites: readonly AgentFavoriteModel[],
): AgentFavoriteModelWire[] {
  return favorites.map((item) => ({
    agent_id: item.agentId,
    model: item.model,
    label: item.label,
  }));
}

export function favoriteModelsEqual(
  left: readonly AgentFavoriteModel[],
  right: readonly AgentFavoriteModel[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      other != null
      && item.agentId === other.agentId
      && item.model === other.model
      && item.label === other.label
    );
  });
}

export function favoriteModelKey(agentId: string, model: string): string {
  return `${agentId.trim()}\u001f${model.trim()}`;
}

export function isFavoriteModel(
  favorites: readonly AgentFavoriteModel[],
  agentId: string,
  model: string,
): boolean {
  const key = favoriteModelKey(agentId, model);
  if (key === "\u001f") return false;
  return favorites.some((item) => favoriteModelKey(item.agentId, item.model) === key);
}

export function toggleFavoriteModel(
  favorites: readonly AgentFavoriteModel[],
  entry: AgentFavoriteModel,
): AgentFavoriteModel[] {
  const next = normalizeFavoriteModel(entry);
  if (!next) return [...favorites];
  const key = favoriteModelKey(next.agentId, next.model);
  if (favorites.some((item) => favoriteModelKey(item.agentId, item.model) === key)) {
    return favorites.filter((item) => favoriteModelKey(item.agentId, item.model) !== key);
  }
  return [...favorites, next];
}

export function orderFavoriteModels(
  favorites: readonly AgentFavoriteModel[],
  agents: ReadonlyArray<{ id: string }>,
): AgentFavoriteModel[] {
  const byAgent = new Map<string, AgentFavoriteModel[]>();
  for (const favorite of favorites) {
    const list = byAgent.get(favorite.agentId) ?? [];
    list.push(favorite);
    byAgent.set(favorite.agentId, list);
  }
  const ordered: AgentFavoriteModel[] = [];
  for (const agent of agents) {
    const list = byAgent.get(agent.id);
    if (!list) continue;
    ordered.push(...list);
    byAgent.delete(agent.id);
  }
  for (const list of byAgent.values()) {
    ordered.push(...list);
  }
  return ordered;
}

export function resolveFavoriteModelLabel(
  favorite: AgentFavoriteModel,
  lookup: ReadonlyArray<{ id: string; label?: string | null; name?: string | null }>,
): string {
  const match = lookup.find((item) => item.id === favorite.model);
  const fromCatalog = match?.label?.trim() || match?.name?.trim();
  return fromCatalog || favorite.label || favorite.model;
}
