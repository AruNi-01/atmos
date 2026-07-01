import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQueryState } from "nuqs";

import { useConnectionStore } from "@/features/connection/store/connection-store";
import type { ConnectionInstanceId } from "@/features/connection/lib/connection-instance";
import { instKey, readJson } from "@/shared/lib/browser-store";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";
import { previewUrlParams } from "@/shared/lib/nuqs/searchParams";

import type { PreviewBrowserTab } from "../components/PreviewBrowserTabBar";
import { canonicalizeUrl } from "../lib/preview-utils";

interface PreviewBrowserContextPrefs {
  tabs: PreviewBrowserTab[];
  activeTabId: string;
}

interface PreviewBrowserPrefs {
  byContext: Record<string, PreviewBrowserContextPrefs>;
}

const DEFAULT_PREVIEW_BROWSER_PREFS: PreviewBrowserPrefs = { byContext: {} };
const MAX_PREVIEW_BROWSER_TABS = 10;

function readPreviewBrowserPrefs(instanceId: ConnectionInstanceId): PreviewBrowserPrefs {
  return readJson(
    instKey(instanceId, "previewBrowser"),
    DEFAULT_PREVIEW_BROWSER_PREFS,
  );
}

function createBrowserTab(
  url = "",
  lastAccessedAt = Date.now(),
): PreviewBrowserTab {
  const normalizedUrl = canonicalizeUrl(url) || url.trim();
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    url: normalizedUrl,
    activeUrl: normalizedUrl,
    title: "",
    titleUrl: "",
    faviconUrl: "",
    lastAccessedAt,
  };
}

function getFiniteAccessedAt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function touchTab(
  tabs: PreviewBrowserTab[],
  tabId: string,
  lastAccessedAt = Date.now(),
): PreviewBrowserTab[] {
  return tabs.map((tab) =>
    tab.id === tabId ? { ...tab, lastAccessedAt } : tab,
  );
}

function pruneLeastRecentlyAccessed(
  context: PreviewBrowserContextPrefs,
): PreviewBrowserContextPrefs {
  if (context.tabs.length <= MAX_PREVIEW_BROWSER_TABS) return context;

  const removeCount = context.tabs.length - MAX_PREVIEW_BROWSER_TABS;
  const removalIds = new Set(
    context.tabs
      .filter((tab) => tab.id !== context.activeTabId)
      .sort((a, b) => (a.lastAccessedAt ?? 0) - (b.lastAccessedAt ?? 0))
      .slice(0, removeCount)
      .map((tab) => tab.id),
  );

  if (removalIds.size === 0) return context;

  const nextTabs = context.tabs.filter((tab) => !removalIds.has(tab.id));
  const activeTabId = nextTabs.some((tab) => tab.id === context.activeTabId)
    ? context.activeTabId
    : (nextTabs[0]?.id ?? context.activeTabId);

  return {
    tabs: nextTabs,
    activeTabId,
  };
}

function normalizeBrowserContext(
  value: PreviewBrowserContextPrefs | undefined,
  fallbackUrl: string,
): PreviewBrowserContextPrefs {
  const seenIds = new Set<string>();
  const now = Date.now();
  const sourceTabs = Array.isArray(value?.tabs) ? value.tabs : [];
  const tabs =
    sourceTabs.length > 0
      ? sourceTabs
          .filter((tab): tab is PreviewBrowserTab => {
            return (
              !!tab &&
              typeof tab === "object" &&
              typeof tab.id === "string" &&
              typeof tab.url === "string" &&
              typeof tab.activeUrl === "string"
            );
          })
          .filter((tab) => {
            if (!tab.id.trim() || seenIds.has(tab.id)) return false;
            seenIds.add(tab.id);
            return true;
          })
          .map((tab, index) => ({
            id: tab.id,
            url: tab.url,
            activeUrl: tab.activeUrl,
            title: typeof tab.title === "string" ? tab.title : "",
            titleUrl: typeof tab.titleUrl === "string" ? tab.titleUrl : "",
            faviconUrl: typeof tab.faviconUrl === "string" ? tab.faviconUrl : "",
            lastAccessedAt: getFiniteAccessedAt(
              tab.lastAccessedAt,
              now - (sourceTabs.length - index),
            ),
          }))
      : [];

  const normalizedTabs =
    tabs.length > 0 ? tabs : [createBrowserTab(fallbackUrl, now)];
  const activeTabId =
    value?.activeTabId &&
    normalizedTabs.some((tab) => tab.id === value.activeTabId)
      ? value.activeTabId
      : normalizedTabs[0].id;

  return pruneLeastRecentlyAccessed({
    tabs: normalizedTabs,
    activeTabId,
  });
}

function getTabNavigationUrl(tab: PreviewBrowserTab | undefined): string {
  return tab?.activeUrl || tab?.url || "";
}

interface UsePreviewBrowserStateOptions {
  workspaceId: string | null;
  projectId?: string;
}

export function usePreviewBrowserState({
  workspaceId,
  projectId,
}: UsePreviewBrowserStateOptions) {
  const instanceId = useConnectionStore((state) => state.activeInstanceId);
  const [committedPreviewUrl, setCommittedPreviewUrl] = useQueryState(
    "pvUrl",
    previewUrlParams.pvUrl,
  );
  const browserContextId = workspaceId || projectId || "default";
  const [browserState, setBrowserState] = useState<PreviewBrowserContextPrefs>(
    () => normalizeBrowserContext(undefined, committedPreviewUrl),
  );
  const browserStateRef = useRef(browserState);
  const [loadedBrowserContext, setLoadedBrowserContext] = useState<{
    instanceId: string;
    contextId: string;
  } | null>(null);
  browserStateRef.current = browserState;

  const activeBrowserTab = useMemo(
    () =>
      browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ??
      browserState.tabs[0],
    [browserState.activeTabId, browserState.tabs],
  );
  const previewTabsToRender = useMemo(
    () => browserState.tabs,
    [browserState.tabs],
  );

  const persistBrowserState = useCallback((nextBrowserState?: PreviewBrowserContextPrefs) => {
    const stateToPersist = nextBrowserState ?? browserStateRef.current;
    const all = readPreviewBrowserPrefs(instanceId);
    useUiPrefStore.getState().writeSlice(instanceId, "previewBrowser", {
      byContext: {
        ...all.byContext,
        [browserContextId]: stateToPersist,
      },
    });
  }, [browserContextId, instanceId]);

  const reloadBrowserStateFromPrefs = useCallback(() => {
    const all = readPreviewBrowserPrefs(instanceId);
    const nextBrowserState = normalizeBrowserContext(
      all.byContext[browserContextId],
      committedPreviewUrl,
    );

    useUiPrefStore.getState().writeSlice(instanceId, "previewBrowser", {
      byContext: {
        ...all.byContext,
        [browserContextId]: nextBrowserState,
      },
    });
    setBrowserState(nextBrowserState);
    setLoadedBrowserContext({ instanceId, contextId: browserContextId });
    return nextBrowserState;
  }, [browserContextId, committedPreviewUrl, instanceId]);

  useEffect(() => {
    const all = readPreviewBrowserPrefs(instanceId);
    setBrowserState(
      normalizeBrowserContext(
        all.byContext[browserContextId],
        committedPreviewUrl,
      ),
    );
    setLoadedBrowserContext({ instanceId, contextId: browserContextId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- committedPreviewUrl is an initial seed; active tab state owns later changes.
  }, [browserContextId, instanceId]);

  useEffect(() => {
    if (
      !loadedBrowserContext ||
      loadedBrowserContext.instanceId !== instanceId ||
      loadedBrowserContext.contextId !== browserContextId
    ) {
      return;
    }

    persistBrowserState(browserState);
  }, [browserContextId, browserState, instanceId, loadedBrowserContext, persistBrowserState]);

  useEffect(() => {
    const activeNavigationUrl = getTabNavigationUrl(activeBrowserTab);
    if (activeNavigationUrl === committedPreviewUrl) return;
    void setCommittedPreviewUrl(activeNavigationUrl);
  }, [activeBrowserTab, committedPreviewUrl, setCommittedPreviewUrl]);

  useEffect(() => {
    const nextUrl = canonicalizeUrl(committedPreviewUrl) || committedPreviewUrl.trim();
    if (!nextUrl) return;

    setBrowserState((current) => {
      const activeTab = current.tabs.find((tab) => tab.id === current.activeTabId);
      if (canonicalizeUrl(getTabNavigationUrl(activeTab)) === nextUrl) {
        return current;
      }

      return {
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === current.activeTabId
            ? {
                ...tab,
                url: nextUrl,
                activeUrl: nextUrl,
                title: "",
                titleUrl: "",
                faviconUrl: "",
                lastAccessedAt: Date.now(),
              }
            : tab,
        ),
      };
    });
  }, [committedPreviewUrl]);

  const updateBrowserTab = useCallback(
    (tabId: string, updater: (tab: PreviewBrowserTab) => PreviewBrowserTab) => {
      setBrowserState((current) => {
        let didChange = false;
        const tabs = current.tabs.map((tab) => {
          if (tab.id !== tabId) return tab;
          const nextTab = updater(tab);
          if (nextTab !== tab) {
            didChange = true;
          }
          return nextTab;
        });

        return didChange
          ? {
              ...current,
              tabs,
            }
          : current;
      });
    },
    [],
  );

  const setBrowserTabPreviewUrl = useCallback(
    (tabId: string, nextUrl: string) => {
      updateBrowserTab(tabId, (tab) =>
        tab.url === nextUrl
          ? tab
          : {
              ...tab,
              url: nextUrl,
            },
      );
    },
    [updateBrowserTab],
  );

  const setBrowserTabActivePreviewUrl = useCallback(
    (tabId: string, nextUrl: string) => {
      const now = Date.now();

      updateBrowserTab(tabId, (tab) => {
        const previousUrl = canonicalizeUrl(tab.activeUrl || tab.url);
        const nextCanonicalUrl = canonicalizeUrl(nextUrl);
        const shouldClearTitle =
          previousUrl && nextCanonicalUrl && previousUrl !== nextCanonicalUrl;
        const titleUrl = canonicalizeUrl(tab.titleUrl || "");
        const shouldKeepIncomingTitle =
          shouldClearTitle && titleUrl && titleUrl === nextCanonicalUrl;
        const nextTitle = shouldClearTitle && !shouldKeepIncomingTitle ? "" : tab.title;
        const nextTitleUrl = shouldClearTitle && !shouldKeepIncomingTitle ? "" : tab.titleUrl;
        const nextFaviconUrl = shouldClearTitle && !shouldKeepIncomingTitle ? "" : tab.faviconUrl;

        if (
          tab.url === nextUrl &&
          tab.activeUrl === nextUrl &&
          tab.title === nextTitle &&
          tab.titleUrl === nextTitleUrl &&
          tab.faviconUrl === nextFaviconUrl
        ) {
          return tab;
        }

        return {
          ...tab,
          url: nextUrl,
          activeUrl: nextUrl,
          title: nextTitle,
          titleUrl: nextTitleUrl,
          faviconUrl: nextFaviconUrl,
          lastAccessedAt: now,
        };
      });
    },
    [updateBrowserTab],
  );

  const handlePreviewTitleChange = useCallback(
    (tabId: string, title: string, pageUrl?: string) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return;
      const titleUrl = pageUrl ? canonicalizeUrl(pageUrl) : "";
      if (!titleUrl) return;

      updateBrowserTab(tabId, (tab) => {
        const currentUrl = canonicalizeUrl(getTabNavigationUrl(tab));
        if (!currentUrl || titleUrl !== currentUrl) return tab;

        return tab.title === trimmedTitle && tab.titleUrl === titleUrl
          ? tab
          : {
              ...tab,
              title: trimmedTitle,
              titleUrl,
            };
      });
    },
    [updateBrowserTab],
  );

  const handlePreviewIconChange = useCallback(
    (tabId: string, faviconUrl: string) => {
      const trimmedFaviconUrl = faviconUrl.trim();
      if (!trimmedFaviconUrl) return;

      updateBrowserTab(tabId, (tab) =>
        tab.faviconUrl === trimmedFaviconUrl
          ? tab
          : {
              ...tab,
              faviconUrl: trimmedFaviconUrl,
            },
      );
    },
    [updateBrowserTab],
  );

  const handleAddBrowserTab = useCallback(() => {
    const now = Date.now();
    const nextTab = createBrowserTab("", now + 1);
    setBrowserState((current) => ({
      ...pruneLeastRecentlyAccessed({
        tabs: [...touchTab(current.tabs, current.activeTabId, now), nextTab],
        activeTabId: nextTab.id,
      }),
    }));
  }, []);

  const handleOpenBrowserTab = useCallback((nextUrl: string) => {
    const normalizedUrl = canonicalizeUrl(nextUrl) || nextUrl.trim();
    if (!normalizedUrl) return;

    const now = Date.now();
    const nextTab = createBrowserTab(normalizedUrl, now + 1);
    setBrowserState((current) => {
      const touchedTabs = touchTab(current.tabs, current.activeTabId, now);
      const activeIndex = touchedTabs.findIndex((tab) => tab.id === current.activeTabId);
      const insertIndex = activeIndex >= 0 ? activeIndex + 1 : touchedTabs.length;

      return {
        ...pruneLeastRecentlyAccessed({
          tabs: [
            ...touchedTabs.slice(0, insertIndex),
            nextTab,
            ...touchedTabs.slice(insertIndex),
          ],
          activeTabId: nextTab.id,
        }),
      };
    });
  }, []);

  const handleSelectBrowserTab = useCallback((tabId: string) => {
    setBrowserState((current) => {
      if (!current.tabs.some((tab) => tab.id === tabId)) return current;

      return {
        ...current,
        activeTabId: tabId,
        tabs: touchTab(current.tabs, tabId),
      };
    });
  }, []);

  const handleCloseBrowserTab = useCallback((tabId: string) => {
    setBrowserState((current) => {
      if (current.tabs.length <= 1) return current;

      const closingIndex = current.tabs.findIndex((tab) => tab.id === tabId);
      if (closingIndex === -1) return current;

      const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId =
        current.activeTabId === tabId
          ? (nextTabs[Math.max(0, closingIndex - 1)]?.id ?? nextTabs[0].id)
          : current.activeTabId;

      return {
        tabs:
          current.activeTabId === tabId
            ? touchTab(nextTabs, nextActiveTabId)
            : nextTabs,
        activeTabId: nextActiveTabId,
      };
    });
  }, []);

  return {
    activeBrowserTab,
    browserState,
    handleAddBrowserTab,
    handleCloseBrowserTab,
    handleOpenBrowserTab,
    handlePreviewTitleChange,
    handlePreviewIconChange,
    persistBrowserState,
    reloadBrowserStateFromPrefs,
    handleSelectBrowserTab,
    previewTabsToRender,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
  };
}
