import { AGENT_OPTIONS } from "@/features/wiki/components/AgentSelect";
import {
  DEFAULT_AGENT_YOLO_MODE,
  resolveAgentLaunchFlags,
} from "@/features/agent/lib/terminal-agent-yolo";
import { getWikiLanguageOptions } from "@/features/wiki/lib/wiki-languages";
import type { CodeAgentCustomEntry } from "@/api/ws-api";
import { createTranslator } from "next-intl";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../../messages/en.json";
import zhMessages from "../../../../../messages/zh.json";

let cachedSettingsModalLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedSettingsModalTranslator: any = null;

function settingsModalT(key: string): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedSettingsModalTranslator || cachedSettingsModalLocale !== locale) {
    cachedSettingsModalLocale = locale;
    cachedSettingsModalTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "settings.modal",
    });
  }
  return cachedSettingsModalTranslator(key as never);
}

export const FEATURE_LANGUAGE_OPTIONS = getWikiLanguageOptions().filter(
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

function agentDefaultFlags(agent: (typeof AGENT_OPTIONS)[number], yoloEnabled = DEFAULT_AGENT_YOLO_MODE) {
  return resolveAgentLaunchFlags(agent, yoloEnabled);
}

export function buildBuiltInOverrides(entries: CodeAgentCustomEntry[]) {
  const next: Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }> = {};
  const defaults = agentDefaultFlags;

  for (const agent of AGENT_OPTIONS) {
    const entry = entries.find((item) => item.id === agent.id);
    if (!entry) continue;
    const resolved = defaults(agent);

    const cmd = entry.cmd !== agent.cmd ? entry.cmd : undefined;
    const flags = entry.flags !== (resolved.params || "") && entry.flags !== (agent.params || "")
      ? entry.flags
      : undefined;
    const interactiveFlags =
      entry.interactiveFlags !== (resolved.interactiveParams || "") &&
      entry.interactiveFlags !== (agent.interactiveParams || "")
        ? entry.interactiveFlags
        : undefined;
    const enabled = entry.enabled === false ? false : undefined;
    if (!cmd && !flags && !interactiveFlags && enabled === undefined) continue;

    next[agent.id] = {};
    if (cmd !== undefined) next[agent.id].cmd = cmd;
    if (flags !== undefined) next[agent.id].flags = flags;
    if (interactiveFlags !== undefined) next[agent.id].interactiveFlags = interactiveFlags;
    if (enabled !== undefined) next[agent.id].enabled = enabled;
  }

  return next;
}

export function buildBuiltInEntries(
  overrides: Record<string, { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }>,
  yoloEnabled: boolean = DEFAULT_AGENT_YOLO_MODE,
): CodeAgentCustomEntry[] {
  return AGENT_OPTIONS.flatMap((agent) => {
    const draft = overrides[agent.id];
    const resolved = agentDefaultFlags(agent, yoloEnabled);
    const cmd = draft?.cmd ?? agent.cmd;
    const flags = draft?.flags ?? resolved.params;
    const interactiveFlags = draft?.interactiveFlags ?? resolved.interactiveParams;
    const enabled = draft?.enabled ?? true;
    const changed =
      cmd !== agent.cmd ||
      flags !== resolved.params ||
      interactiveFlags !== resolved.interactiveParams ||
      enabled !== true;

    if (!changed) return [];

    return [{
      id: agent.id,
      label: agent.label,
      cmd,
      flags,
      interactiveFlags,
      enabled,
    }];
  });
}

export const TEST_NOTIFICATION_PAYLOAD = {
  title: settingsModalT("testNotification.title"),
  body: settingsModalT("testNotification.body"),
};
