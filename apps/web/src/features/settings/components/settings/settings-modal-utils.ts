import { AGENT_OPTIONS } from "@/features/wiki/components/AgentSelect";
import { WIKI_LANGUAGE_OPTIONS } from "@/features/wiki/lib/wiki-languages";
import type { CodeAgentCustomEntry } from "@/api/ws-api";

export const FEATURE_LANGUAGE_OPTIONS = WIKI_LANGUAGE_OPTIONS.filter(
  (option) => option.value !== "other",
);

export function fallbackProviderLabel(providerId: string): string {
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const BUILT_IN_AGENT_IDS = new Set<string>(AGENT_OPTIONS.map((agent) => agent.id));

export function isBuiltInAgentId(id: string): boolean {
  return BUILT_IN_AGENT_IDS.has(id);
}

export function dedupeCodeAgentEntries(
  entries: CodeAgentCustomEntry[],
): CodeAgentCustomEntry[] {
  const deduped = new Map<string, CodeAgentCustomEntry>();
  for (const entry of entries) {
    const id = entry.id?.trim();
    if (!id) continue;
    deduped.set(id, { ...entry, id, enabled: entry.enabled !== false });
  }
  return Array.from(deduped.values());
}

export function buildBuiltInOverrides(entries: CodeAgentCustomEntry[]) {
  const next: Record<string, { cmd?: string; flags?: string; enabled?: boolean }> = {};

  for (const agent of AGENT_OPTIONS) {
    const entry = entries.find((item) => item.id === agent.id);
    if (!entry) continue;

    const cmd = entry.cmd !== agent.cmd ? entry.cmd : undefined;
    const flags = entry.flags !== (agent.params || "") ? entry.flags : undefined;
    const enabled = entry.enabled === false ? false : undefined;
    if (!cmd && !flags && enabled === undefined) continue;

    next[agent.id] = {};
    if (cmd !== undefined) next[agent.id].cmd = cmd;
    if (flags !== undefined) next[agent.id].flags = flags;
    if (enabled !== undefined) next[agent.id].enabled = enabled;
  }

  return next;
}

export function buildBuiltInEntries(
  overrides: Record<string, { cmd?: string; flags?: string; enabled?: boolean }>,
): CodeAgentCustomEntry[] {
  return AGENT_OPTIONS.flatMap((agent) => {
    const draft = overrides[agent.id];
    const cmd = draft?.cmd ?? agent.cmd;
    const flags = draft?.flags ?? (agent.params || "");
    const enabled = draft?.enabled ?? true;
    const changed = cmd !== agent.cmd || flags !== (agent.params || "") || enabled !== true;

    if (!changed) return [];

    return [{
      id: agent.id,
      label: agent.label,
      cmd,
      flags,
      enabled,
    }];
  });
}

export const TEST_NOTIFICATION_PAYLOAD = {
  title: "Atmos Test Notification",
  body: "This is a test notification from Atmos.",
};
