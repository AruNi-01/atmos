import type { PreviewBrowserTab } from "../components/PreviewBrowserTabBar";
import { canonicalizeUrl } from "./preview-utils";

export type PreviewBrowserContextPrefs = {
  tabs: PreviewBrowserTab[];
  activeTabId: string;
};

export type PreviewBrowserPrefs = {
  byContext: Record<string, PreviewBrowserContextPrefs>;
};

export const DEFAULT_PREVIEW_BROWSER_PREFS: PreviewBrowserPrefs = { byContext: {} };

function createBrowserTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPreviewBrowserTab(
  url = "",
  lastAccessedAt = Date.now(),
): PreviewBrowserTab {
  const normalizedUrl = canonicalizeUrl(url) || url.trim();
  return {
    id: createBrowserTabId(),
    url: normalizedUrl,
    activeUrl: normalizedUrl,
    title: "",
    titleUrl: "",
    faviconUrl: "",
    lastAccessedAt,
  };
}

/** Fresh browser surface: a single empty tab (sidebar default after move-to-center). */
export function createInitialBrowserContext(
  url = "",
): PreviewBrowserContextPrefs {
  const tab = createPreviewBrowserTab(url);
  return {
    tabs: [tab],
    activeTabId: tab.id,
  };
}

export function cloneBrowserContext(
  context: PreviewBrowserContextPrefs,
): PreviewBrowserContextPrefs {
  return {
    activeTabId: context.activeTabId,
    tabs: context.tabs.map((tab) => ({ ...tab })),
  };
}

export function getUrlLabel(value: string): string {
  if (!value.trim()) return "";

  try {
    const parsed = new URL(value);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value.replace(/^https?:\/\//i, "");
  }
}

export function getPreviewBrowserTabLabel(
  tab: PreviewBrowserTab | undefined,
  fallback: string,
): string {
  if (!tab) return fallback;

  const title = tab.title?.trim();
  const titleUrl = canonicalizeUrl(tab.titleUrl || "");
  const currentUrl = canonicalizeUrl(tab.activeUrl || tab.url);
  if (title && titleUrl && titleUrl === currentUrl) return title;

  const urlLabel = getUrlLabel(tab.activeUrl || tab.url);
  if (urlLabel) return urlLabel;

  return fallback;
}

export function getActivePreviewBrowserTab(
  context: PreviewBrowserContextPrefs | undefined,
): PreviewBrowserTab | undefined {
  if (!context?.tabs?.length) return undefined;
  return (
    context.tabs.find((tab) => tab.id === context.activeTabId) ?? context.tabs[0]
  );
}

export function getActivePreviewBrowserLabel(
  context: PreviewBrowserContextPrefs | undefined,
  fallback: string,
): string {
  return getPreviewBrowserTabLabel(getActivePreviewBrowserTab(context), fallback);
}

export function getPreviewBrowserTabFaviconUrl(
  tab: PreviewBrowserTab | undefined,
): string | undefined {
  const faviconUrl = tab?.faviconUrl?.trim();
  return faviconUrl || undefined;
}

export function getActivePreviewBrowserFaviconUrl(
  context: PreviewBrowserContextPrefs | undefined,
): string | undefined {
  return getPreviewBrowserTabFaviconUrl(getActivePreviewBrowserTab(context));
}
