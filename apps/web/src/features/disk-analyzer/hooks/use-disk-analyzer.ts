"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  breadcrumbPaths,
  filterTree,
  findNodeByPath,
  formatBytes,
  sortNodes,
  type ChartMode,
  type DiskFilters,
} from "@/features/disk-analyzer/lib/tree-adapters";

export function useDiskAnalyzer() {
  const t = useTranslations("DiskAnalyzer");
  const scanFailedLabel = t("scanFailed");
  const [scanPath, setScanPath] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const scanIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<DiskScanProgress["status"] | "idle">("idle");
  const [progress, setProgress] = useState<DiskScanProgress | null>(null);
  const [tree, setTree] = useState<DiskNode | null>(null);
  const [stats, setStats] = useState<DiskScanStats | null>(null);
  const [suggestions, setSuggestions] = useState<CleanupSuggestion[]>([]);
  const [volume, setVolume] = useState<DiskVolumeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("sunburst");
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filters, setFilters] = useState<DiskFilters>({
    query: "",
    minSize: 0,
    projectsOnly: false,
  });
  const [sortBy, setSortBy] = useState<"size" | "name">("size");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { fsApi } = await import("@/api/ws-api");
        const homeDir = await fsApi.getHomeDir();
        if (!cancelled && homeDir) {
          setScanPath((prev) => prev || homeDir);
          try {
            const info = await diskAnalyzerApi.diskInfo(homeDir);
            if (!cancelled) setVolume(info);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
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
        if (payload.status === "completed" && payload.tree) {
          setTree(payload.tree);
          setStats(payload.stats ?? null);
          setSuggestions(payload.suggestions ?? []);
          setFocusPath(payload.tree.path);
          setSelectedPath(payload.tree.path);
          setBusy(false);
        }
        if (payload.status === "failed") {
          setError(payload.error ?? scanFailedLabel);
          setBusy(false);
        }
        if (payload.status === "cancelled") {
          setBusy(false);
        }
      },
    );
    return off;
  }, [scanFailedLabel]);

  const startScan = useCallback(async () => {
    setError(null);
    setBusy(true);
    setTree(null);
    setStats(null);
    setSuggestions([]);
    setStatus("running");
    try {
      const result = await diskAnalyzerApi.startScan(scanPath || undefined);
      scanIdRef.current = result.scan_id;
      setScanId(result.scan_id);
      setScanPath(result.root_path);
      try {
        const info = await diskAnalyzerApi.diskInfo(result.root_path);
        setVolume(info);
      } catch {
        // Volume lookup is best-effort; do not fail a running scan.
      }
    } catch (e) {
      setBusy(false);
      setStatus("failed");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [scanPath]);

  const cancelScan = useCallback(async () => {
    if (!scanId) return;
    await diskAnalyzerApi.cancelScan(scanId);
  }, [scanId]);

  const deleteSelected = useCallback(
    async (permanent: boolean) => {
      if (!selectedPath || !scanId) return null;
      const result = await diskAnalyzerApi.deletePath(scanId, selectedPath, permanent);
      return result;
    },
    [scanId, selectedPath],
  );

  const filteredTree = useMemo(() => {
    if (!tree) return null;
    return filterTree(tree, filters);
  }, [tree, filters]);

  const focusedNode = useMemo(() => {
    if (!filteredTree || !focusPath) return filteredTree;
    return findNodeByPath(filteredTree, focusPath) ?? filteredTree;
  }, [filteredTree, focusPath]);

  const breadcrumbs = useMemo(() => {
    if (!filteredTree || !focusPath) return [];
    return breadcrumbPaths(filteredTree, focusPath);
  }, [filteredTree, focusPath]);

  const selectedNode = useMemo(() => {
    if (!filteredTree || !selectedPath) return null;
    return findNodeByPath(filteredTree, selectedPath);
  }, [filteredTree, selectedPath]);

  const childList = useMemo(() => {
    if (!focusedNode?.children) return [];
    return sortNodes(focusedNode.children, sortBy);
  }, [focusedNode, sortBy]);

  return {
    scanPath,
    setScanPath,
    scanId,
    status,
    progress,
    tree: filteredTree,
    focusedNode,
    selectedNode,
    stats,
    suggestions,
    volume,
    error,
    chartMode,
    setChartMode,
    focusPath,
    setFocusPath,
    selectedPath,
    setSelectedPath,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    busy,
    breadcrumbs,
    childList,
    startScan,
    cancelScan,
    deleteSelected,
    formatBytes,
  };
}
