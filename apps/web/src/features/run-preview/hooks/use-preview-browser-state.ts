import { useCallback, useEffect, useMemo, useState } from "react";

import { useQueryState } from "nuqs";

import { useConnectionStore } from "@/features/connection/store/connection-store";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
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
  const [loadedBrowserContext, setLoadedBrowserContext] = useState<{
    instanceId: string;
    contextId: string;
  } | null>(null);

  const activeBrowserTab = useMemo(
    () =>
      browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ??
      browserState.tabs[0],
    [browserState.activeTabId, browserState.tabs],
  );
  const shouldKeepInactivePreviewsMounted = useMemo(
    () => !isTauriRuntime(),
    [],
  );
  const previewTabsToRender = useMemo(
    () =>
      shouldKeepInactivePreviewsMounted
        ? browserState.tabs
        : activeBrowserTab
          ? [activeBrowserTab]
          : [],
    [activeBrowserTab, browserState.tabs, shouldKeepInactivePreviewsMounted],
  );

  useEffect(() => {
    const all = useUiPrefStore
      .getState()
      .readSlice(instanceId, "previewBrowser", DEFAULT_PREVIEW_BROWSER_PREFS);
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

    useUiPrefStore.getState().patchSlice(
      instanceId,
      "previewBrowser",
      (previous) => ({
        byContext: {
          ...(previous as PreviewBrowserPrefs).byContext,
          [browserContextId]: browserState,
        },
      }),
      DEFAULT_PREVIEW_BROWSER_PREFS,
    );
  }, [browserContextId, browserState, instanceId, loadedBrowserContext]);

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
        const nextTitle = shouldClearTitle ? "" : tab.title;

        if (
          tab.url === nextUrl &&
          tab.activeUrl === nextUrl &&
          tab.title === nextTitle
        ) {
          return tab;
        }

        return {
          ...tab,
          url: nextUrl,
          activeUrl: nextUrl,
          title: nextTitle,
          lastAccessedAt: now,
        };
      });
    },
    [updateBrowserTab],
  );

  const handlePreviewTitleChange = useCallback(
    (tabId: string, title: string) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return;

      updateBrowserTab(tabId, (tab) =>
        tab.title === trimmedTitle
          ? tab
          : {
              ...tab,
              title: trimmedTitle,
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
    handlePreviewTitleChange,
    handleSelectBrowserTab,
    previewTabsToRender,
    setBrowserTabActivePreviewUrl,
    setBrowserTabPreviewUrl,
  };
}
