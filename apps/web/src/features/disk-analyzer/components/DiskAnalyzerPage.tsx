"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { AnimatePresence, motion } from "motion/react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import {
  ChartPie,
  ChevronRight,
  CircleAlert,
  Folder,
  HardDrive,
  LayoutGrid,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { CleanupSuggestion } from "@/api/ws/disk-analyzer-api";
import { DiskUsageChart } from "@/features/disk-analyzer/components/DiskUsageChart";
import { DiskAnalyzerSuggestPanel } from "@/features/disk-analyzer/components/DiskAnalyzerSuggestPanel";
import { useDiskAnalyzer } from "@/features/disk-analyzer/hooks/use-disk-analyzer";
import {
  GIT_WORKTREES_GROUP_PATH,
  canDeleteDiskPath,
  displayDiskName,
  formatBytes,
  friendlyDiskEntryPath,
  getCleanupHintKey,
  isAtmosOverviewPath,
  isAtmosRuntimeDir,
  isWorktreeSuggestion,
  localizedSyntheticName,
  suggestionTotalSize,
  TOP_N_OPTIONS,
} from "@/features/disk-analyzer/lib/tree-adapters";

const SCAN_CYCLE_EASE = [0.22, 1, 0.36, 1] as const;
const SCAN_CYCLE_TRANSITION = { duration: 0.2, ease: SCAN_CYCLE_EASE } as const;

function DiskAnalyzerScanButton({
  scanning,
  scanLocked,
  disabled,
  scanningLabel,
  cancelLabel,
  rescanLabel,
  onClick,
}: {
  scanning: boolean;
  scanLocked: boolean;
  disabled: boolean;
  scanningLabel: string;
  cancelLabel: string;
  rescanLabel: string;
  onClick: () => void;
}) {
  const [intentCancel, setIntentCancel] = useState(false);
  const showCancel = scanning && intentCancel;
  const label = showCancel
    ? cancelLabel
    : scanLocked
      ? scanningLabel
      : rescanLabel;
  const labelKey = showCancel ? "cancel" : scanLocked ? "scanning" : "rescan";

  useEffect(() => {
    if (!scanning) setIntentCancel(false);
  }, [scanning]);

  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn(
        "h-9 rounded-xl transition-[color,background-color,box-shadow] duration-200",
        showCancel &&
          "bg-destructive/10 text-destructive hover:bg-destructive/10 hover:text-destructive",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-busy={scanLocked}
      aria-label={scanning ? cancelLabel : undefined}
      onMouseEnter={() => {
        if (scanning) setIntentCancel(true);
      }}
      onMouseLeave={() => setIntentCancel(false)}
      onFocus={() => {
        if (scanning) setIntentCancel(true);
      }}
      onBlur={() => setIntentCancel(false)}
    >
      {scanLocked ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      <span className="relative inline-grid overflow-hidden leading-none">
        <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
          {[scanningLabel, cancelLabel, rescanLabel].reduce(
            (longest, item) =>
              item.length > longest.length ? item : longest,
            "",
          )}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={labelKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SCAN_CYCLE_TRANSITION}
            className="col-start-1 row-start-1 whitespace-nowrap"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
}

export function DiskAnalyzerPage() {
  const t = useTranslations("DiskAnalyzer");
  const sessionName = useCallback(
    (name: string) =>
      displayDiskName(name, (key) =>
        t.has(`agentSessionNames.${key}`) ? t(`agentSessionNames.${key}`) : undefined,
      ),
    [t],
  );
  const analyzer = useDiskAnalyzer();
  const pathTitle = useCallback(
    (path: string) =>
      displayNodePath(
        path,
        analyzer.scanPath,
        t("computerRoot"),
        t("atmosRoot"),
        t("agentData"),
        t("gitWorktrees"),
      ),
    [analyzer.scanPath, t],
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [listDeletePath, setListDeletePath] = useState<string | null>(null);
  const [permanent, setPermanent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detailTab, setDetailTab] = useState<"dirs" | "suggest">("dirs");
  const [pendingSuggest, setPendingSuggest] = useState<{
    path: string;
    displayPath: string;
    size: number;
    isWorktree: boolean;
  } | null>(null);
  const [pendingSuggestItems, setPendingSuggestItems] = useState<
    CleanupSuggestion[] | null
  >(null);
  /** Keep last paint-able chart node so list drill does not unmount the chart (kills ECharts data morph). */
  const lastChartNodeRef = useRef(analyzer.focusedNode);

  useEffect(() => {
    if (
      analyzer.focusedNode &&
      (analyzer.focusedNode.children?.length ?? 0) > 0
    ) {
      lastChartNodeRef.current = analyzer.focusedNode;
    }
  }, [analyzer.focusedNode]);

  const chartNode =
    analyzer.focusedNode &&
    (analyzer.focusedNode.children?.length ?? 0) > 0
      ? analyzer.focusedNode
      : lastChartNodeRef.current;

  const isAtScanRoot =
    !!analyzer.focusPath &&
    !!analyzer.scanPath &&
    analyzer.focusPath === analyzer.scanPath;
  // Cap root totals by volume used; nested focus still uses path estimates.
  const parentSize = isAtScanRoot
    ? analyzer.chartRootSize
    : (analyzer.focusedNode?.size ?? analyzer.chartRootSize ?? 1);
  const scanning = analyzer.status === "running" || analyzer.busy;
  /** First paint is idle until auto-start; keep Rescan locked so it cannot race. */
  const scanLocked = scanning || analyzer.status === "idle";

  const openDeleteDialog = (path?: string) => {
    if (path) analyzer.setSelectedPath(path);
    setPendingSuggest(null);
    setPermanent(false);
    setDeleteError(null);
    setListDeletePath(null);
    setDeleteOpen(true);
  };

  const openSuggestDelete = (item: {
    path: string;
    size: number;
    kind?: string | null;
  }) => {
    analyzer.setSelectedPath(item.path);
    setPendingSuggest({
      path: item.path,
      displayPath: pathTitle(item.path),
      size: item.size,
      isWorktree: item.kind === "worktree" || item.kind === "workspace",
    });
    setPermanent(false);
    setDeleteError(null);
    setListDeletePath(null);
    setDeleteOpen(true);
  };

  const onConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const target = pendingSuggest?.path ?? analyzer.selectedPath;
      if (target) {
        const requiresPermanent =
          pendingSuggest?.isWorktree ||
          Boolean(
            analyzer.selectedNode?.is_git_worktree ||
              analyzer.selectedNode?.is_workspace,
          );
        await analyzer.deletePathAt(target, requiresPermanent ? true : permanent);
        setDeleteOpen(false);
        setListDeletePath(null);
        setPermanent(false);
        setPendingSuggest(null);
        await analyzer.refreshAfterDelete(target);
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const onConfirmDeleteAll = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const trashable = (pendingSuggestItems ?? analyzer.sessionSuggestions).some(
        (item) => !isWorktreeSuggestion(item),
      );
      await analyzer.deleteSuggestions(
        trashable ? permanent : true,
        pendingSuggestItems ?? undefined,
      );
      setDeleteAllOpen(false);
      setPermanent(false);
      setPendingSuggestItems(null);
    } catch (e) {
      const deletedPaths =
        e && typeof e === "object" && "deletedPaths" in e
          ? (e as { deletedPaths?: string[] }).deletedPaths ?? []
          : [];
      if (deletedPaths.length > 0) {
        setPendingSuggestItems((prev) => {
          if (!prev) return null;
          const next = prev.filter((item) => !deletedPaths.includes(item.path));
          return next.length > 0 ? next : null;
        });
      }
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const pendingBulkItems = pendingSuggestItems ?? analyzer.sessionSuggestions;
  const pendingBulkNeedsTrash = pendingBulkItems.some(
    (item) => !isWorktreeSuggestion(item),
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background/50">
      {/* Header — compact so the chart can grow */}
      <div className="shrink-0">
        <div className="w-full px-4 pb-3 pt-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HardDrive className="size-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {t("title")}
                </h1>
                <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                  {t("subtitle")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="disk-analyzer-full-scan"
                    checked={analyzer.scanAllSpace}
                    disabled={analyzer.busy && !scanning}
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      analyzer.setScanAllSpace(next);
                      void (async () => {
                        if (scanning) {
                          try {
                            await analyzer.cancelScan();
                          } catch {
                            // best-effort cancel before scope switch
                          }
                        }
                        await analyzer.startScan();
                      })();
                    }}
                  />
                  <Label htmlFor="disk-analyzer-full-scan">
                    {t("fullScan")}
                  </Label>
                </div>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={t("scanScopeHintAria")}
                    >
                      <CircleAlert className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-xs text-xs leading-relaxed [&_a]:pointer-events-auto"
                      // Allow clicking the Mole link without dismissing awkwardly.
                      onPointerDownOutside={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (target?.closest?.("a")) e.preventDefault();
                      }}
                    >
                      <span>
                        {t.rich("scanScopeHint", {
                          // next-intl rich tags: <mole>Mole</mole> → chunks === "Mole"
                          mole: (chunks) => (
                            <a
                              href="https://mole.fit/?atp=aarynlu"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline underline-offset-2 hover:opacity-90"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {chunks}
                            </a>
                          ),
                        })}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <DiskAnalyzerScanButton
                scanning={scanning}
                scanLocked={scanLocked}
                disabled={analyzer.status === "idle"}
                scanningLabel={t("scanningButton")}
                cancelLabel={t("cancel")}
                rescanLabel={t("rescan")}
                onClick={() => {
                  if (scanning) {
                    void analyzer.cancelScan();
                    return;
                  }
                  void analyzer.startScan();
                }}
              />
            </div>
          </div>

          {analyzer.error ? (
            <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {analyzer.error}
            </div>
          ) : null}
        </div>
      </div>

      {/* Body — main column flex-shrinks when the details rail opens */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {/* Main chart column */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Breadcrumbs + chart view controls */}
          <div className="flex flex-wrap items-center gap-2 px-2 pt-2 pb-1 sm:px-3">
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm">
              {analyzer.breadcrumbs.length > 0 ? (
                analyzer.breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.path}>
                    {index > 0 ? (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                    ) : null}
                    <button
                      type="button"
                      className={cn(
                        "max-w-[12rem] truncate rounded-md px-1.5 py-0.5 transition-colors",
                        index === analyzer.breadcrumbs.length - 1
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      title={pathTitle(crumb.path)}
                      onClick={() => analyzer.drillTo(crumb.path)}
                    >
                      {index === 0
                        ? rootBreadcrumbLabel(
                            analyzer.scanPath,
                            t("computerRoot"),
                            t("atmosRoot"),
                          )
                        : (localizedSyntheticName(crumb.path, {
                            atmosRoot: t("atmosRoot"),
                            agentData: t("agentData"),
                            gitWorktrees: t("gitWorktrees"),
                          }) ??
                          (crumb.name === "__other__"
                            ? t("other")
                            : sessionName(crumb.name)))}
                    </button>
                  </React.Fragment>
                ))
              ) : (
                <span className="text-muted-foreground">{t("scanningWait")}</span>
              )}
              {analyzer.isLevelLoading ? (
                <Loader2 className="ml-2 size-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </nav>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-border/60 bg-muted/20 px-2.5 text-xs shadow-none"
                aria-label={t("switchChartMode", {
                  mode:
                    analyzer.chartMode === "treemap"
                      ? t("sunburst")
                      : t("treemap"),
                })}
                title={t("switchChartMode", {
                  mode:
                    analyzer.chartMode === "treemap"
                      ? t("sunburst")
                      : t("treemap"),
                })}
                onClick={() =>
                  analyzer.setChartMode(
                    analyzer.chartMode === "treemap" ? "sunburst" : "treemap",
                  )
                }
              >
                {analyzer.chartMode === "treemap" ? (
                  <LayoutGrid className="size-3.5" />
                ) : (
                  <ChartPie className="size-3.5" />
                )}
                {analyzer.chartMode === "treemap" ? t("treemap") : t("sunburst")}
              </Button>
              <Select
                value={String(analyzer.topN)}
                onValueChange={(value) => analyzer.setTopN(Number(value))}
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto min-w-[5.5rem] gap-1.5 border-border/60 bg-muted/20 text-xs shadow-none"
                  title={t("topNHint")}
                  aria-label={t("topNHint")}
                >
                  <span className="text-muted-foreground">{t("topN")}</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" position="popper">
                  {TOP_N_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={detailsOpen ? t("hideDetails") : t("showDetails")}
                title={detailsOpen ? t("hideDetails") : t("showDetails")}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                {detailsOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Tight inset so the chart fills almost the whole main column; side rail flex-shrinks this. */}
          <div className="relative min-h-0 flex-1 px-1.5 pb-1.5 pt-0.5 sm:px-2 sm:pb-2">
            {chartNode && (chartNode.children?.length ?? 0) > 0 ? (
              <div className="relative h-full min-h-0 w-full">
                <DiskUsageChart
                  node={chartNode}
                  rootSize={parentSize}
                  mode={analyzer.chartMode}
                  scanPath={analyzer.scanPath}
                  projectLabel={t("atmosProject")}
                  workspaceLabel={t("atmosWorkspace")}
                  gitWorktreeLabel={t("gitWorktree")}
                  gitWorktreesLabel={t("gitWorktrees")}
                  agentDataLabel={t("agentData")}
                  runtimeLabel={t("atmosRuntimeDir")}
                  otherLabel={t("other")}
                  localizeName={sessionName}
                  enterDirectoryLabel={t("enterDirectory")}
                  deleteLabel={t("delete")}
                  onSelectPath={analyzer.setSelectedPath}
                  onDrillPath={analyzer.drillTo}
                  onRequestDelete={(path) => openDeleteDialog(path)}
                />
                {analyzer.isLevelLoading ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
                    <Loader2 className="size-7 animate-spin text-muted-foreground/80" />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                {scanning || analyzer.isLevelLoading ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-muted-foreground/70" />
                    <p>
                      {analyzer.isLevelLoading && !scanning
                        ? t("loadingLevel")
                        : t("scanningWait")}
                    </p>
                    {analyzer.progress?.current_path ? (
                      <p
                        className="max-w-md truncate text-xs text-muted-foreground/70"
                        title={pathTitle(analyzer.progress.current_path)}
                      >
                        {pathTitle(analyzer.progress.current_path)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p>{t("empty")}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Side rail — Dirs list or cleanup suggestions */}
        <aside
          className={cn(
            // Width transition shrinks the main flex column; chart listens via ResizeObserver.
            "flex shrink-0 flex-col bg-background/40 transition-[width] duration-200 ease-out",
            detailsOpen ? "w-[300px] sm:w-[320px]" : "w-0 overflow-hidden",
          )}
          aria-hidden={!detailsOpen}
        >
          {detailsOpen ? (
            <TooltipProvider delayDuration={250}>
            <Tabs
              value={detailTab}
              onValueChange={(value) =>
                setDetailTab(value === "suggest" ? "suggest" : "dirs")
              }
              variant="pill"
              className="flex min-h-0 flex-1 flex-col"
            >
            <div className="flex h-10 shrink-0 items-center gap-1.5 px-2 pt-2">
              <TabsList className="h-8 min-w-0 gap-0.5 p-0.5">
                <TabsTrigger value="dirs" className="h-7 gap-1 px-2 text-xs">
                  <Folder className="size-3.5 shrink-0" />
                  {t("tabDirs")}
                </TabsTrigger>
                <TabsTrigger value="suggest" className="h-7 gap-1 px-2 text-xs">
                  <Sparkles className="size-3.5 shrink-0" />
                  {t("tabClearSuggest")}
                </TabsTrigger>
              </TabsList>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 shrink-0 rounded-full px-2.5 text-xs shadow-none"
                disabled={analyzer.refreshingDetails || !analyzer.scanId}
                aria-label={t("refreshDetailsAria")}
                title={t("refreshDetailsAria")}
                onClick={() => void analyzer.refreshDetails()}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    analyzer.refreshingDetails && "animate-spin",
                  )}
                />
                {t("refreshDetails")}
              </Button>
            </div>
            {detailTab === "suggest" ? (
              <DiskAnalyzerSuggestPanel
                suggestions={analyzer.sessionSuggestions}
                ready={analyzer.suggestionsReady}
                scanning={scanning}
                deleting={deleting}
                localizeName={sessionName}
                pathTitle={pathTitle}
                onOpenItem={(item) => analyzer.drillTo(item.path)}
                onDeleteOne={(item) => openSuggestDelete(item)}
                onDeleteAll={() => {
                  setPendingSuggestItems(null);
                  setPermanent(false);
                  setDeleteError(null);
                  setDeleteAllOpen(true);
                }}
                onDeleteGroup={(items) => {
                  setPendingSuggestItems(items);
                  setPermanent(false);
                  setDeleteError(null);
                  setDeleteAllOpen(true);
                }}
              />
            ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 space-y-2 px-4 py-3">
                {analyzer.selectedNode ? (
                  <>
                    {/* Row 1: name + badge …… size */}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div
                        className="min-w-0 shrink truncate text-sm font-semibold"
                        title={pathTitle(analyzer.selectedNode.path)}
                      >
                        {displayNodeName(
                          analyzer.selectedNode,
                          analyzer.scanPath,
                          t("computerRoot"),
                          t("atmosRoot"),
                          t("other"),
                          t("agentData"),
                          t("gitWorktrees"),
                          sessionName,
                        )}
                      </div>
                      <NodeKindBadge
                        node={analyzer.selectedNode}
                        projectLabel={t("atmosProject")}
                        workspaceLabel={t("atmosWorkspace")}
                        gitWorktreeLabel={t("gitWorktree")}
                        gitWorktreesLabel={t("gitWorktrees")}
                        agentDataLabel={t("agentData")}
                        runtimeLabel={t("atmosRuntimeDir")}
                      />
                      <CanCleanBadge
                        hintKey={getCleanupHintKey(
                          analyzer.selectedNode.name,
                          analyzer.selectedNode.size,
                        )}
                        label={t("canClean")}
                      />
                      <div className="ml-auto shrink-0 text-sm font-semibold tabular-nums tracking-tight">
                        {formatBytes(
                          analyzer.selectedPath === analyzer.scanPath
                            ? analyzer.chartRootSize
                            : analyzer.selectedNode.size,
                        )}
                      </div>
                    </div>
                    {/* Row 2: path …… file/dir counts (no share %) */}
                    <div className="flex min-w-0 items-center gap-2">
                      <PathEllipsis
                        path={displayNodePath(
                          analyzer.selectedNode.path,
                          analyzer.scanPath,
                          t("computerRoot"),
                          t("atmosRoot"),
                          t("agentData"),
                          t("gitWorktrees"),
                        )}
                        className="min-w-0 flex-1"
                      />
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                        {t("counts", {
                          files: analyzer.selectedNode.file_count,
                          dirs: analyzer.selectedNode.dir_count,
                        })}
                      </div>
                    </div>
                    {analyzer.volumeUsedBytes != null &&
                    analyzer.selectedPath === analyzer.scanPath &&
                    (analyzer.selectedNode.size ?? 0) > analyzer.volumeUsedBytes ? (
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {t("sizeEstimateNote")}
                      </p>
                    ) : null}
                    {canDeleteDiskPath(
                      analyzer.selectedNode.path,
                      analyzer.selectedNode.name,
                      analyzer.scanPath,
                    ) ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full rounded-xl"
                        onClick={() => openDeleteDialog()}
                      >
                        <Trash2 className="size-3.5" />
                        {t("delete")}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("selectNode")}</p>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
                {analyzer.childList.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {analyzer.isLevelLoading ? t("loadingLevel") : t("noChildren")}
                  </p>
                ) : (
                    <div className="space-y-px">
                      {analyzer.childList.map((child, index) => {
                        const share =
                          parentSize > 0
                            ? Math.min(100, (child.size / parentSize) * 100)
                            : 0;
                        const cleanupHintKey = getCleanupHintKey(child.name, child.size);
                        const canDelete = canDeleteDiskPath(
                          child.path,
                          child.name,
                          analyzer.scanPath,
                        );
                        const popoverOpen = listDeletePath === child.path;
                        const enterRow = () => {
                          analyzer.setSelectedPath(child.path);
                          // Same as chart click: enter directories (chart animates via data update).
                          if (child.name === "__other__") return;
                          if (child.is_dir) {
                            analyzer.drillTo(child.path);
                          }
                        };
                        return (
                          <div
                            key={`${child.path}::${child.name}::${index}`}
                            role="button"
                            tabIndex={0}
                            className={cn(
                              // Only hover / open-delete highlight — never sticky from focus or selectedPath
                              // (opening delete sets selectedPath for the API, which used to leave bg-muted on).
                              "group relative flex w-full cursor-pointer items-center gap-1 overflow-hidden rounded-md px-2 py-1 transition-colors",
                              popoverOpen ? "bg-muted" : "hover:bg-muted/50",
                            )}
                            onClick={enterRow}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                enterRow();
                              }
                            }}
                          >
                            <div
                              className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/[0.04]"
                              style={{ width: `${share}%` }}
                            />
                            <div className="relative flex min-w-0 flex-1 items-center gap-1.5 text-left">
                              <span
                                className="truncate text-xs font-medium"
                                title={pathTitle(child.path)}
                              >
                                {displayNodeName(
                                  child,
                                  analyzer.scanPath,
                                  t("computerRoot"),
                                  t("atmosRoot"),
                                  t("other"),
                                  t("agentData"),
                                  t("gitWorktrees"),
                                  sessionName,
                                )}
                              </span>
                              <NodeKindBadge
                                node={child}
                                projectLabel={t("atmosProject")}
                                workspaceLabel={t("atmosWorkspace")}
                                gitWorktreeLabel={t("gitWorktree")}
                                gitWorktreesLabel={t("gitWorktrees")}
                                agentDataLabel={t("agentData")}
                                runtimeLabel={t("atmosRuntimeDir")}
                              />
                              <CanCleanBadge
                                hintKey={cleanupHintKey}
                                label={t("canClean")}
                              />
                            </div>

                            {/* Size + hover delete: button width 0 → 28px so size slides left */}
                            <div className="relative z-10 flex shrink-0 items-center">
                              <span className="text-[11px] tabular-nums text-muted-foreground transition-transform duration-200 ease-out">
                                {formatBytes(child.size)}
                              </span>
                              {canDelete ? (
                                <div
                                  className={cn(
                                    "overflow-hidden transition-[width,margin,opacity] duration-200 ease-out",
                                    // Hover / open only — no focus-within (trigger keeps focus after popover closes).
                                    popoverOpen
                                      ? "ml-0.5 w-6 opacity-100"
                                      : "ml-0 w-0 opacity-0 group-hover:ml-0.5 group-hover:w-6 group-hover:opacity-100",
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Popover
                                    open={popoverOpen}
                                    onOpenChange={(open) => {
                                      if (open) {
                                        analyzer.setSelectedPath(child.path);
                                        setPermanent(false);
                                        setDeleteError(null);
                                        setListDeletePath(child.path);
                                      } else {
                                        setListDeletePath((cur) =>
                                          cur === child.path ? null : cur,
                                        );
                                        setDeleteError(null);
                                        setPermanent(false);
                                        // Drop focus so the row doesn't stay "active" after dismiss.
                                        requestAnimationFrame(() => {
                                          const el = document.activeElement;
                                          if (el instanceof HTMLElement) el.blur();
                                        });
                                      }
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        className={cn(
                                          "size-6 shrink-0 text-muted-foreground transition-transform duration-200 ease-out hover:bg-destructive/10 hover:text-destructive",
                                          popoverOpen
                                            ? "translate-x-0"
                                            : "translate-x-2 group-hover:translate-x-0",
                                        )}
                                        aria-label={t("deleteItem")}
                                        title={t("deleteItem")}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                        }}
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="end"
                                      side="left"
                                      sideOffset={8}
                                      className="w-72 max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden p-3"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="min-w-0 space-y-3">
                                        <div className="min-w-0 space-y-1">
                                          <p className="text-sm font-medium">
                                            {t("deleteTitle")}
                                          </p>
                                          <p className="min-w-0 whitespace-pre-wrap break-all text-xs leading-relaxed text-muted-foreground">
                                            {t("deleteDescription", {
                                              path: child.path,
                                              size: formatBytes(child.size),
                                            })}
                                            {child.is_git_worktree ? (
                                              <>
                                                {"\n\n"}
                                                {t("deleteWorktreeNote")}
                                              </>
                                            ) : null}
                                          </p>
                                        </div>
                                        {child.is_git_worktree || child.is_workspace ? null : (
                                        <label className="flex min-w-0 items-start gap-2 text-xs leading-snug">
                                          <Checkbox
                                            className="mt-0.5 shrink-0"
                                            checked={permanent}
                                            onCheckedChange={(checked) =>
                                              setPermanent(checked === true)
                                            }
                                          />
                                          <span className="min-w-0 break-words">
                                            {t("permanentDelete")}
                                          </span>
                                        </label>
                                        )}
                                        {deleteError && listDeletePath === child.path ? (
                                          <div className="text-xs text-destructive">
                                            {deleteError}
                                          </div>
                                        ) : null}
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setListDeletePath(null)}
                                          >
                                            {t("cancel")}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            disabled={deleting}
                                            onClick={() => void onConfirmDelete()}
                                          >
                                            {deleting ? (
                                              <Loader2 className="size-3.5 animate-spin" />
                                            ) : null}
                                            {child.is_git_worktree ||
                                            child.is_workspace ||
                                            permanent
                                              ? t("confirmPermanent")
                                              : t("confirmTrash")}
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                )}
              </div>
            </div>
            )}
            </Tabs>
            </TooltipProvider>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setPendingSuggest(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription className="min-w-0 whitespace-pre-wrap break-all">
              {t("deleteDescription", {
                path:
                  pendingSuggest?.displayPath ??
                  (analyzer.selectedNode
                    ? pathTitle(analyzer.selectedNode.path)
                    : analyzer.selectedPath
                      ? pathTitle(analyzer.selectedPath)
                      : ""),
                size: formatBytes(
                  pendingSuggest?.size ?? analyzer.selectedNode?.size ?? 0,
                ),
              })}
              {pendingSuggest?.isWorktree ||
              analyzer.selectedNode?.is_git_worktree ? (
                <>
                  {"\n\n"}
                  {t("deleteWorktreeNote")}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {pendingSuggest?.isWorktree ||
          analyzer.selectedNode?.is_git_worktree ||
          analyzer.selectedNode?.is_workspace ? null : (
            <label className="flex min-w-0 items-start gap-2 text-sm leading-snug">
              <Checkbox
                className="mt-0.5 shrink-0"
                checked={permanent}
                onCheckedChange={(checked) => setPermanent(checked === true)}
              />
              <span className="min-w-0 break-words">{t("permanentDelete")}</span>
            </label>
          )}
          {deleteError ? (
            <div className="text-sm text-destructive">{deleteError}</div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void onConfirmDelete()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {pendingSuggest?.isWorktree ||
              analyzer.selectedNode?.is_git_worktree ||
              analyzer.selectedNode?.is_workspace ||
              permanent
                ? t("confirmPermanent")
                : t("confirmTrash")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteAllOpen}
        onOpenChange={(open) => {
          setDeleteAllOpen(open);
          if (!open) setPendingSuggestItems(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingSuggestItems
                ? t("suggestDeleteGroupTitle")
                : t("deleteAllSuggestTitle")}
            </DialogTitle>
            <DialogDescription className="min-w-0 whitespace-pre-wrap break-all">
              {t("deleteAllSuggestDescription", {
                count: pendingBulkItems.length,
                size: formatBytes(suggestionTotalSize(pendingBulkItems)),
              })}
              {pendingBulkItems.some(isWorktreeSuggestion) ? (
                <>
                  {"\n\n"}
                  {t("deleteWorktreeNote")}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {pendingBulkNeedsTrash ? (
            <label className="flex min-w-0 items-start gap-2 text-sm leading-snug">
              <Checkbox
                className="mt-0.5 shrink-0"
                checked={permanent}
                onCheckedChange={(checked) => setPermanent(checked === true)}
              />
              <span className="min-w-0 break-words">{t("permanentDelete")}</span>
            </label>
          ) : null}
          {deleteError ? (
            <div className="text-sm text-destructive">{deleteError}</div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || pendingBulkItems.length === 0}
              onClick={() => void onConfirmDeleteAll()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {pendingBulkNeedsTrash && !permanent
                ? t("confirmTrash")
                : t("confirmPermanent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Cleanup-candidate chip — tooltip shows localized why it is safe to remove. */
function CanCleanBadge({
  hintKey,
  label,
}: {
  hintKey: string | undefined;
  label: string;
}) {
  const t = useTranslations("DiskAnalyzer");
  if (!hintKey) return null;
  // Prefer exact key; fall back to generic copy if a new basename is not in messages yet.
  const reason = t.has(`cleanupHints.${hintKey}`)
    ? t(`cleanupHints.${hintKey}`)
    : t("cleanupHints.default");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 cursor-help rounded bg-destructive/15 px-1.5 py-px text-[10px] font-medium text-destructive">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

/** Compact kind tag beside a folder name (Details list). */
function NodeKindBadge({
  node,
  projectLabel,
  workspaceLabel,
  gitWorktreeLabel,
  gitWorktreesLabel,
  agentDataLabel,
  runtimeLabel,
}: {
  node: {
    name?: string;
    path?: string;
    is_project?: boolean;
    is_workspace?: boolean;
    is_git_worktree?: boolean;
    is_agent_data?: boolean;
  };
  projectLabel: string;
  workspaceLabel: string;
  gitWorktreeLabel: string;
  gitWorktreesLabel: string;
  agentDataLabel: string;
  runtimeLabel: string;
}) {
  let label: string | null = null;
  if (isAtmosRuntimeDir(node)) {
    label = runtimeLabel;
  } else if (node.is_workspace) {
    label = workspaceLabel;
  } else if (node.is_project) {
    label = projectLabel;
  } else if (node.is_git_worktree) {
    label =
      node.path === GIT_WORKTREES_GROUP_PATH
        ? gitWorktreesLabel
        : gitWorktreeLabel;
  } else if (node.is_agent_data) {
    label = agentDataLabel;
  }
  if (!label) return null;
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

/** Path with leading ellipsis when too long (overflow from the start). */
function PathEllipsis({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground",
        className,
      )}
      title={path}
      // RTL makes the ellipsis appear on the left for long absolute paths.
      style={{ direction: "rtl", textAlign: "left" }}
    >
      <bdi style={{ unicodeBidi: "plaintext" }}>{path}</bdi>
    </div>
  );
}

/** True for `/Users/<name>` or `/home/<name>` (the home directory itself). */
function isHomeRootPath(path: string): boolean {
  if (!path) return false;
  const parts = path.split("/").filter(Boolean);
  return (parts[0] === "Users" || parts[0] === "home") && parts.length === 2;
}

function rootBreadcrumbLabel(
  scanPath: string,
  homeLabel: string,
  atmosLabel: string,
): string {
  if (isAtmosOverviewPath(scanPath)) return atmosLabel;
  return homeLabel;
}

function displayNodeName(
  node: { name: string; path: string },
  scanPath: string,
  homeLabel: string,
  atmosLabel: string,
  otherLabel: string,
  agentDataLabel: string,
  gitWorktreesLabel: string,
  localizeName?: (name: string) => string,
): string {
  if (node.name === "__other__") return otherLabel;
  const synthetic = localizedSyntheticName(node.path, {
    atmosRoot: atmosLabel,
    agentData: agentDataLabel,
    gitWorktrees: gitWorktreesLabel,
  });
  if (synthetic) return synthetic;
  if (node.name === "Atmos") return atmosLabel;
  if (
    (scanPath && node.path === scanPath && isHomeRootPath(scanPath)) ||
    node.name === "/" ||
    node.name === "~" ||
    node.name === "Home" ||
    isHomeRootPath(node.path)
  ) {
    return homeLabel;
  }
  if (scanPath && node.path === scanPath) {
    return isAtmosOverviewPath(scanPath) ? atmosLabel : homeLabel;
  }
  return localizeName?.(node.name) ?? node.name;
}

/** Show `~` / Atmos / group names for synthetic roots; otherwise the real absolute path. */
function displayNodePath(
  path: string,
  scanPath: string,
  homeLabel: string,
  atmosLabel: string,
  agentDataLabel: string,
  gitWorktreesLabel: string,
): string {
  const synthetic = localizedSyntheticName(path, {
    atmosRoot: atmosLabel,
    agentData: agentDataLabel,
    gitWorktrees: gitWorktreesLabel,
  });
  if (synthetic) return synthetic;
  if (!path || path === "/") {
    if (scanPath && scanPath !== "/" && isHomeRootPath(scanPath)) {
      return homeLabel;
    }
    if (isHomeRootPath(path)) return homeLabel;
  }
  if (scanPath && path === scanPath) {
    return isAtmosOverviewPath(scanPath) ? atmosLabel : homeLabel;
  }
  if (isHomeRootPath(path)) return homeLabel;
  return friendlyDiskEntryPath(path);
}
