/** Reopen Token Usage share after Hub OAuth in another tab. */

export type TokenUsageShareTab = "share" | "publish";

const STORAGE_KEY = "atmos:token-usage-share-resume";
const TTL_MS = 15 * 60 * 1000;

type ResumePayload = {
  tab: TokenUsageShareTab;
  at: number;
};

let memoryResume: ResumePayload | null = null;

function parseTab(raw: unknown): TokenUsageShareTab | null {
  return raw === "share" || raw === "publish" ? raw : null;
}

function readStored(): ResumePayload | null {
  if (memoryResume) return memoryResume;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResumePayload;
  } catch {
    return null;
  }
}

export function peekTokenUsageShareResume(): TokenUsageShareTab | null {
  const parsed = readStored();
  if (!parsed || typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) {
    return null;
  }
  return parseTab(parsed.tab);
}

export function applyTokenUsageShareResumeToPath(path: string): string {
  const tab = peekTokenUsageShareResume();
  if (!tab) return path;
  try {
    const url = new URL(path, "https://app.atmos.land");
    if (!url.pathname.startsWith("/token-usage")) return path;
    url.searchParams.set("share", tab);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

export function consumeTokenUsageShareQuery(): TokenUsageShareTab | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("share");
    const tab = parseTab(raw);
    if (!tab) return null;
    url.searchParams.delete("share");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
    return tab;
  } catch {
    return null;
  }
}

export function markTokenUsageShareResume(
  tab: TokenUsageShareTab = "publish",
): void {
  const payload: ResumePayload = { tab, at: Date.now() };
  memoryResume = payload;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota / tests */
  }
}

export function takeTokenUsageShareResume(): TokenUsageShareTab | null {
  const parsed = readStored();
  memoryResume = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (!parsed || typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) {
    return null;
  }
  return parseTab(parsed.tab);
}

export function clearTokenUsageShareResume(): void {
  memoryResume = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function __resetTokenUsageShareResumeForTests(): void {
  clearTokenUsageShareResume();
}

export function __seedTokenUsageShareResumeForTests(
  payload: ResumePayload,
): void {
  memoryResume = payload;
}
