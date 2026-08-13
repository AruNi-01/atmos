"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  diskAnalyzerApi,
  type CleanupSuggestion,
  type DiskNode,
  type DiskScanProgress,
  type DiskScanStats,
  type DiskVolumeInfo,
} from "@/api/ws/disk-analyzer-api";
import {
  diskAnalyzerLevelQueryKey,
  diskAnalyzerQueryKeyRoot,
  removeDiskAnalyzerQueries,
} from "@/features/disk-analyzer/lib/disk-analyzer-query-options";
import {
  buildBreadcrumbs,
  collectCleanupSuggestions,
  DEFAULT_TOP_N,
  filterTree,
  findNodeByPath,
  formatBytes,
  isChildrenLoaded,
  isFsPathAncestor,
  levelNeedsWiderTopN,
  sortNodes,
  takeTopChildren,
  type ChartMode,
  type DiskFilters,
} from "@/features/disk-analyzer/lib/tree-adapters";

/** Attach `level` under the deepest path-ancestor still present in `root`. */
function graftLevelOntoTree(root: DiskNode, level: DiskNode): DiskNode {
  let deepestPath = root.path;
  const findDeepest = (node: DiskNode) => {
    if (node.path !== level.path && isFsPathAncestor(node.path, level.path)) {
      if (deepestPath === root.path || node.path.length > deepestPath.length) {
        deepestPath = node.path;
      }
    }
    for (const child of node.children ?? []) findDeepest(child);
  };
  findDeepest(root);

  const attach = (node: DiskNode): DiskNode => {
    if (node.path !== deepestPath) {
      if (!node.children?.length) return node;
      let changed = false;
      const children = node.children.map((child) => {
        const next = attach(child);
        if (next !== child) changed = true;
        return next;
      });
      return changed ? { ...node, children } : node;
    }
    const children = [...(node.children ?? [])];
    const idx = children.findIndex((child) => child.path === level.path);
    const previous = idx >= 0 ? children[idx] : undefined;
    const grafted: DiskNode = {
      ...level,
      is_project: level.is_project || previous?.is_project || false,
      is_workspace: level.is_workspace || previous?.is_workspace || false,
      is_git_worktree: level.is_git_worktree || previous?.is_git_worktree || false,
      is_agent_data: level.is_agent_data || previous?.is_agent_data || false,
    };
    if (idx >= 0) children[idx] = grafted;
    else children.push(grafted);
    return { ...node, children };
  };
  return attach(root);
}

function mergeLevelIntoTree(root: DiskNode | null, level: DiskNode): DiskNode {
  if (!root) return level;
  if (root.path === level.path) {
    return level;
  }
  let found = false;
  const walk = (node: DiskNode): DiskNode => {
    if (node.path === level.path) {
      found = true;
      return {
        ...level,
        is_project: level.is_project || node.is_project,
        is_workspace: level.is_workspace || node.is_workspace,
        is_git_worktree: level.is_git_worktree || node.is_git_worktree,
        is_agent_data: level.is_agent_data || node.is_agent_data,
      };
    }
    if (!node.children?.length) return node;
    let changed = false;
    const children = node.children.map((child) => {
      const next = walk(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...node, children } : node;
  };
  const next = walk(root);
  if (found) return next;
  // On-demand drill path not yet linked (or wiped by a shallow root refresh).
  return graftLevelOntoTree(root, level);
}

/** After a root tree refresh, re-apply deeper cached levels so drill paths stay linked. */
function reapplyLevelCache(
  root: DiskNode,
  levelCache: Record<string, DiskNode>,
  skipPath: string,
): DiskNode {
  let merged = root;
  // Longer paths first so parents exist before we overwrite with richer children.
  const paths = Object.keys(levelCache)
    .filter((path) => path !== skipPath && path !== root.path)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const path of paths) {
    const cached = levelCache[path];
    if (cached) merged = mergeLevelIntoTree(merged, cached);
  }
  return merged;
}

export function useDiskAnalyzer() {
  const t = useTranslations("DiskAnalyzer");
  const scanFailedLabel = t("scanFailed");
  const queryClient = useQueryClient();
  const queryScope = useComputerQueryScope();
  const [scanPath, setScanPath] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const scanIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<DiskScanProgress["status"] | "idle">("idle");
  const [progress, setProgress] = useState<DiskScanProgress | null>(null);
  const [tree, setTree] = useState<DiskNode | null>(null);
  /** Path → fully/partially scanned level nodes (for on-demand drill). */
  const [levelCache, setLevelCache] = useState<Record<string, DiskNode>>({});
  const levelCacheRef = useRef<Record<string, DiskNode>>({});
  const [stats, setStats] = useState<DiskScanStats | null>(null);
  const [suggestions, setSuggestions] = useState<CleanupSuggestion[]>([]);
  const [volume, setVolume] = useState<DiskVolumeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("treemap");
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filters, setFilters] = useState<DiskFilters>({
    query: "",
    minSize: 0,
    projectsOnly: false,
  });
  /** false = Atmos-scoped default; true = home + Applications full-space scan. */
  const [scanAllSpace, setScanAllSpace] = useState(false);
  const scanAllSpaceRef = useRef(false);
  const [topN, setTopN] = useState(DEFAULT_TOP_N);
  const [busy, setBusy] = useState(false);
  const [refreshingDetails, setRefreshingDetails] = useState(false);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const startLockRef = useRef(false);
  const loadingPathRef = useRef<string | null>(null);
  const focusPathRef = useRef<string | null>(null);
  const prevTopNRef = useRef(topN);
  const treeRef = useRef<DiskNode | null>(null);
  focusPathRef.current = focusPath;
  treeRef.current = tree;

  const rememberLevel = useCallback((level: DiskNode) => {
    const nextCache = { ...levelCacheRef.current, [level.path]: level };
    levelCacheRef.current = nextCache;
    setLevelCache(nextCache);
    setTree((prevTree) => {
      let merged = mergeLevelIntoTree(prevTree, level);
      // Shallow overview/root progress replaces the whole tree and would drop
      // grafted drill paths — re-apply the level cache so breadcrumbs stay.
      if (merged.path === level.path) {
        merged = reapplyLevelCache(merged, nextCache, level.path);
      }
      return merged;
    });
  }, []);

  // Volume info for the scan target (default: home directory).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await diskAnalyzerApi.diskInfo();
        if (!cancelled) setVolume(info);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const off = useWebSocketStore.getState().onEvent(
      "disk_analyzer_scan_progress",
      (raw) => {
        const payload = raw as DiskScanProgress;
        const activeId = scanIdRef.current;
        if (!activeId || payload.scan_id !== activeId) return;

        setProgress(payload);
        setStatus(payload.status);

        if (payload.tree) {
          const level = payload.tree;
          rememberLevel(level);
          setFocusPath((fp) => fp ?? level.path);
          setSelectedPath((sp) => sp ?? level.path);

          // Persist ready levels in TanStack cache (never store intermediate loading).
          if (
            (payload.status === "level_completed" ||
              payload.status === "completed" ||
              level.children_loaded) &&
            scanIdRef.current
          ) {
            const levelPath = payload.level_path ?? level.path;
            queryClient.setQueryData(
              diskAnalyzerLevelQueryKey(
                queryScope,
                scanIdRef.current,
                levelPath,
                topN,
              ),
              {
                status: "ready" as const,
                tree: level,
                stats: payload.stats ?? null,
              },
            );
          }

          if (
            payload.level_path &&
            loadingPathRef.current === payload.level_path &&
            (payload.status === "level_completed" ||
              payload.status === "completed" ||
              level.children_loaded)
          ) {
            loadingPathRef.current = null;
            setLoadingPath(null);
          }
        }

        if (payload.stats) {
          setStats(payload.stats);
        } else if (
          payload.status === "running" ||
          payload.status === "level_completed" ||
          payload.status === "completed"
        ) {
          // Progressive events often omit `stats`; keep counts in sync from the payload.
          const files = payload.files_scanned ?? 0;
          const dirs = payload.dirs_scanned ?? 0;
          const bytes = payload.bytes_scanned ?? 0;
          if (files > 0 || dirs > 0 || bytes > 0) {
            setStats((prev) => ({
              root_path: prev?.root_path ?? payload.level_path ?? "",
              total_size: Math.max(bytes, prev?.total_size ?? 0),
              files_scanned: Math.max(files, prev?.files_scanned ?? 0),
              dirs_scanned: Math.max(dirs, prev?.dirs_scanned ?? 0),
              error_count: payload.error_count ?? prev?.error_count ?? 0,
              elapsed_ms: prev?.elapsed_ms ?? 0,
            }));
          }
        }
        if (payload.suggestions) {
          // Confirmed items can stream in while scanning. Only apply an empty
          // list once the walk is done so "all clean" is not a mid-scan lie.
          if (payload.suggestions.length > 0 || payload.status === "completed") {
            setSuggestions(payload.suggestions);
          }
        }

        if (payload.status === "completed") {
          startLockRef.current = false;
          setBusy(false);
          loadingPathRef.current = null;
          setLoadingPath(null);
        }
        if (payload.status === "level_completed") {
          if (payload.level_path && loadingPathRef.current === payload.level_path) {
            loadingPathRef.current = null;
            setLoadingPath(null);
          }
        }
        if (payload.status === "failed") {
          setError(payload.error ?? scanFailedLabel);
          startLockRef.current = false;
          setBusy(false);
          loadingPathRef.current = null;
          setLoadingPath(null);
        }
        if (payload.status === "cancelled") {
          startLockRef.current = false;
          setBusy(false);
          loadingPathRef.current = null;
          setLoadingPath(null);
        }
      },
    );
    return off;
  }, [queryClient, queryScope, rememberLevel, scanFailedLabel, topN]);

  const startScan = useCallback(async () => {
    if (startLockRef.current) return;
    startLockRef.current = true;
    setError(null);
    setBusy(true);
    setTree(null);
    levelCacheRef.current = {};
    setLevelCache({});
    setStats(null);
    setSuggestions([]);
    setStatus("running");
    setFocusPath(null);
    setSelectedPath(null);
    loadingPathRef.current = null;
    setLoadingPath(null);
    // Drop client query cache; backend also clears path cache on start_scan.
    removeDiskAnalyzerQueries(queryClient, queryScope);
    // Cancel previous session first (server also purges this connection's scans).
    const prevId = scanIdRef.current;
    if (prevId) {
      try {
        await diskAnalyzerApi.cancelScan(prevId);
      } catch {
        // best-effort
      }
      scanIdRef.current = null;
      setScanId(null);
    }
    try {
      // Default: Atmos-scoped paths. scanAllSpace → home + Applications.
      const result = await diskAnalyzerApi.startScan(
        undefined,
        topN,
        scanAllSpaceRef.current,
      );
      scanIdRef.current = result.scan_id;
      setScanId(result.scan_id);
      setScanPath(result.root_path);
      loadingPathRef.current = result.root_path;
      setLoadingPath(result.root_path);
      try {
        // Volume gauge uses home (or real path); synthetic atmos:// has no volume.
        const volumePath =
          result.root_path.startsWith("atmos://") ? undefined : result.root_path;
        const info = await diskAnalyzerApi.diskInfo(volumePath);
        setVolume(info);
      } catch {
        // Volume lookup is best-effort; do not fail a running scan.
      }
    } catch (e) {
      startLockRef.current = false;
      setBusy(false);
      setStatus("failed");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [queryClient, queryScope, topN]);

  const setScanAllSpaceAndMaybeRescan = useCallback(
    (next: boolean) => {
      scanAllSpaceRef.current = next;
      setScanAllSpace(next);
    },
    [],
  );

  // Auto-start primary-locations scan once WS is available.
  useEffect(() => {
    if (autoStartedRef.current) return;
    const unsub = useWebSocketStore.subscribe((state) => {
      if (autoStartedRef.current) return;
      if (state.connectionState === "connected") {
        autoStartedRef.current = true;
        void startScan();
      }
    });
    if (useWebSocketStore.getState().connectionState === "connected") {
      autoStartedRef.current = true;
      void startScan();
    }
    return unsub;
  }, [startScan]);

  const cancelScan = useCallback(async () => {
    const id = scanIdRef.current ?? scanId;
    if (!id) return;
    try {
      await diskAnalyzerApi.cancelScan(id);
    } finally {
      // Free UI immediately; server has already dropped the session slot.
      scanIdRef.current = null;
      setScanId(null);
      startLockRef.current = false;
      setBusy(false);
      setStatus("cancelled");
      setProgress(null);
      loadingPathRef.current = null;
      setLoadingPath(null);
    }
  }, [scanId]);

  const loadLevel = useCallback(
    async (path: string, opts?: { force?: boolean }) => {
      if (!scanId) return;
      if (!opts?.force && loadingPathRef.current === path) return;
      loadingPathRef.current = path;
      setLoadingPath(path);
      setError(null);
      try {
        const key = diskAnalyzerLevelQueryKey(queryScope, scanId, path, topN);
        if (opts?.force) {
          queryClient.removeQueries({ queryKey: key });
          setLevelCache((prev) => {
            if (!(path in prev)) return prev;
            const next = { ...prev };
            delete next[path];
            levelCacheRef.current = next;
            return next;
          });
        } else {
          // Prefer a ready client cache (do not treat "loading" as a final answer —
          // that used to sticky-block drill-in after the first get_tree).
          const cached = queryClient.getQueryData<
            Awaited<ReturnType<typeof diskAnalyzerApi.getTree>>
          >(key);
          if (
            cached?.status === "ready" &&
            cached.tree &&
            isChildrenLoaded(cached.tree)
          ) {
            rememberLevel(cached.tree);
            if (cached.stats) setStats(cached.stats);
            loadingPathRef.current = null;
            setLoadingPath(null);
            return;
          }
        }

        // Always hit the server for unloaded dirs so backend can spawn scan_level.
        // Only cache ready trees; intermediate "loading" must not be stored.
        const result = await diskAnalyzerApi.getTree(scanId, path, topN);
        if (result.status === "ready" && result.tree) {
          queryClient.setQueryData(key, result);
          rememberLevel(result.tree);
          if (result.stats) setStats(result.stats);
          loadingPathRef.current = null;
          setLoadingPath(null);
        }
        // status === "loading": wait for progressive WS events (level_completed)
      } catch (e) {
        loadingPathRef.current = null;
        setLoadingPath(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [queryClient, queryScope, rememberLevel, scanId, topN],
  );

  // Raising Top N cannot invent children from a pruned snapshot — refetch this folder.
  useEffect(() => {
    if (prevTopNRef.current === topN) return;
    prevTopNRef.current = topN;
    const path = focusPathRef.current;
    if (!scanIdRef.current || !path) return;
    const cached = levelCacheRef.current[path];
    const fromTree = treeRef.current ? findNodeByPath(treeRef.current, path) : null;
    const node = cached ?? fromTree;
    if (levelNeedsWiderTopN(node, topN)) {
      void loadLevel(path, { force: true });
    }
  }, [loadLevel, topN]);

  const drillTo = useCallback(
    (path: string) => {
      setFocusPath(path);
      setSelectedPath(path);
      const cached = levelCache[path];
      const node = cached ?? (tree ? findNodeByPath(tree, path) : null);
      // Truncated / measure-only leaves always reload on enter.
      if (!node || (node.is_dir && !isChildrenLoaded(node))) {
        void loadLevel(path);
        return;
      }
      // Directory with no expanded children yet but known to have content — load.
      // Note: `du` overview shells often have size>0 with file_count=dir_count=0.
      if (
        node.is_dir &&
        node.name !== "__other__" &&
        (node.children?.length ?? 0) === 0 &&
        (node.dir_count > 0 || node.file_count > 0 || node.size > 0)
      ) {
        void loadLevel(path);
      }
    },
    [levelCache, loadLevel, tree],
  );

  const deletePathAt = useCallback(
    async (path: string, permanent: boolean) => {
      if (!scanId) return null;
      return diskAnalyzerApi.deletePath(scanId, path, permanent);
    },
    [scanId],
  );

  const deleteSelected = useCallback(
    async (permanent: boolean) => {
      if (!selectedPath) return null;
      return deletePathAt(selectedPath, permanent);
    },
    [deletePathAt, selectedPath],
  );

  const dropSuggestionPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setSuggestions((prev) =>
      prev.filter((item) => {
        const itemPath = item.path.replace(/\/+$/, "");
        return !paths.some((raw) => {
          const deleted = raw.replace(/\/+$/, "");
          return itemPath === deleted || itemPath.startsWith(`${deleted}/`);
        });
      }),
    );
  }, []);

  /**
   * After a successful delete: stay on the current directory (do not restart the whole scan).
   * If the focused folder itself was deleted, move up to its parent.
   */
  const refreshAfterDelete = useCallback(
    async (deletedPaths?: string | string[] | null) => {
      const deletedList = (
        Array.isArray(deletedPaths)
          ? deletedPaths
          : deletedPaths
            ? [deletedPaths]
            : selectedPath
              ? [selectedPath]
              : []
      ).filter(Boolean);
      const root = scanPath;
      if (!scanId || !root) return;

      dropSuggestionPaths(deletedList);

      let stay = focusPath && focusPath.length > 0 ? focusPath : root;
      for (const deleted of deletedList) {
        const deletedNorm = deleted.replace(/\/+$/, "");
        const stayNorm = stay.replace(/\/+$/, "");
        if (
          stayNorm === deletedNorm ||
          stayNorm.startsWith(`${deletedNorm}/`)
        ) {
          stay = parentDirPath(deletedNorm, root);
        }
      }

      // Drop stale caches for the deleted subtree and the level we will reload.
      setLevelCache((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          for (const deleted of deletedList) {
            const d = deleted.replace(/\/+$/, "");
            if (k === d || k.startsWith(`${d}/`)) delete next[k];
          }
          if (k === stay) delete next[k];
        }
        levelCacheRef.current = next;
        return next;
      });
      queryClient.removeQueries({
        queryKey: [...diskAnalyzerQueryKeyRoot(queryScope), "level", scanId],
      });

      setFocusPath(stay);
      setSelectedPath(stay);
      loadingPathRef.current = null;
      await loadLevel(stay, { force: true });
    },
    [
      dropSuggestionPaths,
      focusPath,
      loadLevel,
      queryClient,
      queryScope,
      scanId,
      scanPath,
      selectedPath,
    ],
  );

  const refreshDetails = useCallback(async () => {
    const id = scanIdRef.current ?? scanId;
    if (!id) return;
    setRefreshingDetails(true);
    try {
      const path = focusPathRef.current ?? scanPath;
      if (path) {
        await loadLevel(path, { force: true });
      }
      const result = await diskAnalyzerApi.getSuggestions(id);
      setSuggestions(result.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingDetails(false);
    }
  }, [loadLevel, scanId, scanPath]);

  const deleteSuggestions = useCallback(
    async (permanent: boolean, targets?: CleanupSuggestion[]) => {
      const id = scanIdRef.current ?? scanId;
      if (!id) return;
      const items = [...(targets ?? suggestions)];
      const deleted: string[] = [];
      let firstError: unknown = null;
      for (const item of items) {
        if (firstError) break;
        try {
          await diskAnalyzerApi.deletePath(id, item.path, permanent);
          deleted.push(item.path);
        } catch (e) {
          firstError = e;
        }
      }
      if (deleted.length > 0) {
        await refreshAfterDelete(deleted);
      }
      if (firstError) {
        throw firstError instanceof Error
          ? firstError
          : new Error(String(firstError));
      }
    },
    [refreshAfterDelete, scanId, suggestions],
  );

  // Filter only — apply top-N once on the focused level to avoid double `__other__`.
  const filteredTree = useMemo(() => {
    if (!tree) return null;
    return filterTree(tree, filters);
  }, [tree, filters]);

  const scanningLive = status === "running" || busy;

  const focusedNode = useMemo(() => {
    // Mid-scan: keep zero-size siblings (still being walked) so Library etc. are not collapsed.
    const topOpts = { preserveZeroSizeDirs: scanningLive };
    if (!focusPath) {
      return filteredTree ? takeTopChildren(filteredTree, topN, topOpts) : null;
    }
    const cached = levelCache[focusPath];
    if (cached) {
      const filtered = filterTree(cached, filters);
      return filtered ? takeTopChildren(filtered, topN, topOpts) : null;
    }
    if (!filteredTree) return null;
    const found = findNodeByPath(filteredTree, focusPath);
    if (!found) return takeTopChildren(filteredTree, topN, topOpts);
    return takeTopChildren(found, topN, topOpts);
  }, [busy, filteredTree, filters, focusPath, levelCache, status, topN]);

  const breadcrumbs = useMemo(() => {
    if (!tree) return [];
    if (!focusPath) return [tree];
    // Rebuild from tree + levelCache so list drill-in never collapses to root
    // while the focus path is still being grafted into the linked tree.
    return buildBreadcrumbs(tree, focusPath, levelCache);
  }, [levelCache, tree, focusPath]);

  const selectedNode = useMemo(() => {
    if (!selectedPath) return null;
    if (levelCache[selectedPath]) return levelCache[selectedPath];
    if (tree) {
      const found = findNodeByPath(tree, selectedPath);
      if (found) return found;
    }
    return null;
  }, [levelCache, selectedPath, tree]);

  // Always size-desc — focusedNode is already top-N + single `__other__`.
  // Same set of tiles painted on the chart for this directory level.
  const childList = useMemo(() => {
    if (!focusedNode?.children) return [];
    return sortNodes(focusedNode.children, "size");
  }, [focusedNode]);

  /**
   * Cleanup tips for **currently displayed** chart tiles only (immediate children).
   * Updates when the user drills to another directory — does not scan nested contents.
   */
  const scopedSuggestions = useMemo(
    () => collectCleanupSuggestions(childList),
    [childList],
  );

  const isLevelLoading =
    loadingPath !== null &&
    (focusPath === loadingPath || loadingPath === scanPath || selectedPath === loadingPath);

  /** Volume used space — authoritative for the free-space gauge. */
  const volumeUsedBytes =
    volume && volume.total_bytes > 0
      ? Math.max(0, volume.total_bytes - volume.available_bytes)
      : null;

  /**
   * Size used for chart proportions / root totals.
   * Cap path-sum estimates by volume used so the UI cannot claim more than the disk.
   */
  const chartRootSize = useMemo(() => {
    const pathSum = stats?.total_size ?? tree?.size ?? 0;
    if (volumeUsedBytes != null && volumeUsedBytes > 0 && pathSum > 0) {
      return Math.min(pathSum, volumeUsedBytes);
    }
    return pathSum || 1;
  }, [stats?.total_size, tree?.size, volumeUsedBytes]);

  return {
    scanPath,
    scanId,
    status,
    progress,
    tree: filteredTree,
    rawTree: tree,
    focusedNode,
    selectedNode,
    stats,
    /** Session-global cleanup suggestions (time + cache hints). */
    sessionSuggestions: suggestions,
    suggestionsReady: status === "completed",
    refreshingDetails,
    /** Suggestions under the current focus directory (chart-tile hints). */
    suggestions: scopedSuggestions,
    volume,
    volumeUsedBytes,
    chartRootSize,
    error,
    chartMode,
    setChartMode,
    focusPath,
    setFocusPath,
    selectedPath,
    setSelectedPath,
    filters,
    setFilters,
    scanAllSpace,
    setScanAllSpace: setScanAllSpaceAndMaybeRescan,
    topN,
    setTopN,
    busy,
    loadingPath,
    isLevelLoading,
    breadcrumbs,
    childList,
    startScan,
    cancelScan,
    drillTo,
    loadLevel,
    deleteSelected,
    deletePathAt,
    deleteSuggestions,
    refreshAfterDelete,
    refreshDetails,
    formatBytes,
  };
}

/** Parent directory of `path`, clamped to `root` when at/above scan root. */
function parentDirPath(path: string, root: string): string {
  const normalized = path.replace(/\/+$/, "");
  const rootNorm = root.replace(/\/+$/, "") || root;
  if (!normalized || normalized === rootNorm) return root;
  if (normalized.startsWith("atmos://")) {
    // Synthetic overview has no filesystem parent — stay on root.
    return root;
  }
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return root;
  const parent = normalized.slice(0, idx) || "/";
  if (
    rootNorm &&
    parent !== rootNorm &&
    !parent.startsWith(`${rootNorm}/`) &&
    parent.length < rootNorm.length
  ) {
    return root;
  }
  return parent;
}
