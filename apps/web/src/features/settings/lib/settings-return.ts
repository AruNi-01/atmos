type HistoryEntryLike = { url?: string };

export function isSettingsPathname(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";
  return normalized === "/settings";
}

/** Last same-origin href that is not the settings route, or `/` if none. */
export function resolveSettingsReturnHref(
  entries: HistoryEntryLike[],
  origin: string,
): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const raw = entries[i]?.url;
    if (!raw) continue;
    try {
      const url = new URL(raw, origin);
      if (url.origin !== origin) continue;
      if (isSettingsPathname(url.pathname)) continue;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      continue;
    }
  }
  return "/";
}