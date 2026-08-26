import { isTmuxIndexTitle, nextCenterTabSessionOscTitle } from "@atmos/shared/terminal";
import { globalKey, readJson, writeJson } from "@/shared/lib/browser-store";

/**
 * Last cwd/command + stable OSC session topic per tmux window.
 * Browser localStorage only — not the persisted center layout document.
 */
const STORAGE_KEY = globalKey("terminalDynamicTitles");

export function normalizeStoredDynamicTitle(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || isTmuxIndexTitle(trimmed)) return undefined;
  return trimmed;
}

type PaneTitleCacheEntry = {
  dynamicTitle?: string;
  oscTitle?: string;
};

/** workspaceId → tmuxWindowName → titles */
type TitleCache = Record<string, Record<string, PaneTitleCacheEntry>>;

let memory: TitleCache | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntry(value: unknown): PaneTitleCacheEntry | null {
  // Legacy shape: window name → dynamicTitle string.
  if (typeof value === "string") {
    const dynamicTitle = normalizeStoredDynamicTitle(value);
    return dynamicTitle ? { dynamicTitle } : null;
  }
  if (!isPlainObject(value)) return null;
  const dynamicTitle = normalizeStoredDynamicTitle(
    typeof value.dynamicTitle === "string" ? value.dynamicTitle : undefined,
  );
  const oscTitle =
    typeof value.oscTitle === "string" && value.oscTitle.trim()
      ? value.oscTitle.trim()
      : undefined;
  if (!dynamicTitle && !oscTitle) return null;
  return {
    ...(dynamicTitle ? { dynamicTitle } : {}),
    ...(oscTitle ? { oscTitle } : {}),
  };
}

function normalizeWorkspaceMap(raw: unknown): Record<string, PaneTitleCacheEntry> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, PaneTitleCacheEntry> = {};
  for (const [windowName, value] of Object.entries(raw)) {
    const entry = normalizeEntry(value);
    if (entry) out[windowName] = entry;
  }
  return out;
}

function loadCache(): TitleCache {
  if (memory) return memory;
  const stored = readJson<unknown>(STORAGE_KEY, null);
  const next: TitleCache = {};
  if (isPlainObject(stored)) {
    for (const [workspaceId, value] of Object.entries(stored)) {
      const mapped = normalizeWorkspaceMap(value);
      if (Object.keys(mapped).length > 0) next[workspaceId] = mapped;
    }
  }
  memory = next;
  return memory;
}

function saveCache(next: TitleCache): void {
  memory = next;
  writeJson(STORAGE_KEY, next);
}

function patchWindow(
  workspaceId: string,
  tmuxWindowName: string,
  patch: (entry: PaneTitleCacheEntry) => PaneTitleCacheEntry,
): void {
  const all = loadCache();
  const current = all[workspaceId]?.[tmuxWindowName] ?? {};
  const nextEntry = patch(current);
  const same =
    (current.dynamicTitle ?? undefined) === (nextEntry.dynamicTitle ?? undefined) &&
    (current.oscTitle ?? undefined) === (nextEntry.oscTitle ?? undefined);
  if (same) return;

  const nextWs = { ...all[workspaceId] };
  if (!nextEntry.dynamicTitle && !nextEntry.oscTitle) {
    delete nextWs[tmuxWindowName];
  } else {
    nextWs[tmuxWindowName] = nextEntry;
  }

  if (Object.keys(nextWs).length === 0) {
    const rest = { ...all };
    delete rest[workspaceId];
    saveCache(rest);
    return;
  }
  saveCache({ ...all, [workspaceId]: nextWs });
}

export function readCachedDynamicTitle(
  workspaceId: string,
  tmuxWindowName: string | undefined,
): string | undefined {
  if (!workspaceId || !tmuxWindowName) return undefined;
  return normalizeStoredDynamicTitle(loadCache()[workspaceId]?.[tmuxWindowName]?.dynamicTitle);
}

export function readCachedOscTitle(
  workspaceId: string,
  tmuxWindowName: string | undefined,
): string | undefined {
  if (!workspaceId || !tmuxWindowName) return undefined;
  const osc = loadCache()[workspaceId]?.[tmuxWindowName]?.oscTitle?.trim();
  return osc || undefined;
}

export function writeCachedDynamicTitle(
  workspaceId: string,
  tmuxWindowName: string | undefined,
  title: string | undefined,
): void {
  if (!workspaceId || !tmuxWindowName) return;
  const next = normalizeStoredDynamicTitle(title);
  if (!next) return;
  patchWindow(workspaceId, tmuxWindowName, (entry) => ({
    ...entry,
    dynamicTitle: next,
  }));
}

/**
 * Cache the **stable** session topic (not Grok spinner / activity prefixes).
 * `undefined` clears a previously stored topic.
 */
export function writeCachedOscTitle(
  workspaceId: string,
  tmuxWindowName: string | undefined,
  liveOscTitle: string | undefined,
): void {
  if (!workspaceId || !tmuxWindowName) return;
  patchWindow(workspaceId, tmuxWindowName, (entry) => {
    const oscTitle = nextCenterTabSessionOscTitle(entry.oscTitle, liveOscTitle);
    if (oscTitle) return { ...entry, oscTitle };
    const next = { ...entry };
    delete next.oscTitle;
    return next;
  });
}

/** Test helper — drop the in-memory memo so the next read hits storage. */
export function resetCachedDynamicTitlesForTests(): void {
  memory = null;
}
