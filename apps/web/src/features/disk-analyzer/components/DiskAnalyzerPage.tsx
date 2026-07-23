"use client";

import React, { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  ChevronRight,
  CircleAlert,
  FolderKanban,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { DiskUsageChart } from "@/features/disk-analyzer/components/DiskUsageChart";
import { useDiskAnalyzer } from "@/features/disk-analyzer/hooks/use-disk-analyzer";
import {
  formatBytes,
  TOP_N_OPTIONS,
} from "@/features/disk-analyzer/lib/tree-adapters";

export function DiskAnalyzerPage() {
  const t = useTranslations("DiskAnalyzer");
  const analyzer = useDiskAnalyzer();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const usedPercent =
    analyzer.volume && analyzer.volume.total_bytes > 0
      ? Math.round(
          ((analyzer.volume.total_bytes - analyzer.volume.available_bytes) /
            analyzer.volume.total_bytes) *
            100,
        )
      : null;

  const isAtScanRoot =
    !!analyzer.focusPath &&
    !!analyzer.scanPath &&
    analyzer.focusPath === analyzer.scanPath;
  // Cap root totals by volume used; nested focus still uses path estimates.
  const parentSize = isAtScanRoot
    ? analyzer.chartRootSize
    : (analyzer.focusedNode?.size ?? analyzer.chartRootSize ?? 1);
  const scanning = analyzer.status === "running" || analyzer.busy;

  const onConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await analyzer.deleteSelected(permanent);
      setDeleteOpen(false);
      setPermanent(false);
      await analyzer.startScan();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background/50">
      {/* Header — management center style */}
      <div className="shrink-0 border-b border-border/60">
        <div className="mx-auto w-full max-w-[1400px] px-6 pb-4 pt-8 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HardDrive className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {t("title")}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  {t("subtitle")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="disk-analyzer-scan-all-space"
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
                  <Label
                    htmlFor="disk-analyzer-scan-all-space"
                    className="cursor-pointer text-xs font-normal text-muted-foreground"
                  >
                    {t("scanAllSpace")}
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
                              href="https://github.com/tw93/mole"
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
              {scanning ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  onClick={() => void analyzer.cancelScan()}
                >
                  {t("cancel")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl"
                  onClick={() => void analyzer.startScan()}
                  disabled={analyzer.busy}
                >
                  {analyzer.busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {t("rescan")}
                </Button>
              )}
            </div>
          </div>

          {/* Volume + progress strip */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {analyzer.volume ? (
              <div className="flex min-w-[200px] max-w-sm flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {t("freeSpace", {
                        free: formatBytes(analyzer.volume.available_bytes),
                        total: formatBytes(analyzer.volume.total_bytes),
                      })}
                    </span>
                    {usedPercent !== null ? (
                      <span className="tabular-nums text-muted-foreground">
                        {usedPercent}%
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        usedPercent !== null && usedPercent > 90
                          ? "bg-destructive"
                          : "bg-foreground/70",
                      )}
                      style={{ width: `${usedPercent ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {scanning || analyzer.stats ? (
              <div className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">
                {scanning && analyzer.progress ? (
                  // Live progress only while scanning — avoid stale 0 files/dirs from empty stats.
                  t("scanning", {
                    files: analyzer.progress.files_scanned,
                    dirs: analyzer.progress.dirs_scanned ?? 0,
                    bytes: formatBytes(analyzer.progress.bytes_scanned),
                    path: shortenPath(analyzer.progress.current_path ?? "…"),
                  })
                ) : analyzer.stats ? (
                  t("statsCounts", {
                    files: analyzer.stats.files_scanned,
                    dirs: analyzer.stats.dirs_scanned,
                  })
                ) : null}
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
          </div>

          {analyzer.error ? (
            <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {analyzer.error}
            </div>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1">
        {/* Main chart column */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Breadcrumbs + chart view controls (no divider under breadcrumbs) */}
          <div className="flex flex-wrap items-center gap-2 px-6 pt-3 pb-1 sm:px-8">
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
                        "max-w-[10rem] truncate rounded-md px-1.5 py-0.5 transition-colors",
                        index === analyzer.breadcrumbs.length - 1
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      onClick={() => analyzer.drillTo(crumb.path)}
                    >
                      {index === 0
                        ? rootBreadcrumbLabel(
                            analyzer.scanPath,
                            t("computerRoot"),
                            t("atmosRoot"),
                          )
                        : crumb.name === "__other__"
                          ? t("other")
                          : crumb.name}
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
              <Tabs
                value={analyzer.chartMode}
                onValueChange={(value) => {
                  if (value === "treemap" || value === "sunburst") {
                    analyzer.setChartMode(value);
                  }
                }}
              >
                <TabsList>
                  <TabsTab value="treemap" className="text-xs">
                    {t("treemap")}
                  </TabsTab>
                  <TabsTab value="sunburst" className="text-xs">
                    {t("sunburst")}
                  </TabsTab>
                </TabsList>
              </Tabs>
              <Select
                value={String(analyzer.topN)}
                onValueChange={(value) => analyzer.setTopN(Number(value))}
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto min-w-[5.5rem] gap-1.5 border-border/60 bg-muted/20 text-xs shadow-none"
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
            </div>
          </div>

          <div className="relative min-h-0 flex-1 px-4 pb-4 pt-1 sm:px-6 sm:pb-6">
            {analyzer.focusedNode &&
            ((analyzer.focusedNode.children?.length ?? 0) > 0 || !analyzer.isLevelLoading) ? (
              <DiskUsageChart
                node={analyzer.focusedNode}
                rootSize={parentSize}
                mode={analyzer.chartMode}
                projectLabel={t("atmosProject")}
                otherLabel={t("other")}
                showParentLabelText={t("showParentLabels")}
                onSelectPath={analyzer.setSelectedPath}
                onDrillPath={analyzer.drillTo}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                {scanning || analyzer.isLevelLoading ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-muted-foreground/70" />
                    <p>
                      {analyzer.isLevelLoading && !scanning
                        ? t("loadingLevel")
                        : t("scanningWait")}
                    </p>
                    {analyzer.progress?.current_path ? (
                      <p className="max-w-md truncate text-xs text-muted-foreground/70">
                        {analyzer.progress.current_path}
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

        {/* Detail rail */}
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-border/60 bg-background/40">
          <div className="border-b border-border/50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("details")}
            </div>
            {analyzer.selectedNode ? (
              <div className="mt-2 space-y-2">
                <div className="truncate text-sm font-semibold" title={analyzer.selectedNode.name}>
                  {displayNodeName(
                    analyzer.selectedNode,
                    analyzer.scanPath,
                    t("computerRoot"),
                    t("atmosRoot"),
                    t("other"),
                  )}
                </div>
                <div
                  className="break-all text-[11px] leading-relaxed text-muted-foreground"
                  title={analyzer.selectedNode.path}
                >
                  {displayNodePath(
                    analyzer.selectedNode.path,
                    analyzer.scanPath,
                    t("computerRoot"),
                    t("atmosRoot"),
                  )}
                </div>
                <div className="text-lg font-semibold tabular-nums tracking-tight">
                  {formatBytes(
                    analyzer.selectedPath === analyzer.scanPath
                      ? analyzer.chartRootSize
                      : analyzer.selectedNode.size,
                  )}
                </div>
                {parentSize > 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {(
                      ((analyzer.selectedPath === analyzer.scanPath
                        ? analyzer.chartRootSize
                        : analyzer.selectedNode.size) /
                        parentSize) *
                      100
                    ).toFixed(1)}
                    % ·{" "}
                    {t("counts", {
                      files: analyzer.selectedNode.file_count,
                      dirs: analyzer.selectedNode.dir_count,
                    })}
                  </div>
                ) : null}
                {analyzer.volumeUsedBytes != null &&
                analyzer.selectedPath === analyzer.scanPath &&
                (analyzer.selectedNode.size ?? 0) > analyzer.volumeUsedBytes ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t("sizeEstimateNote")}
                  </p>
                ) : null}
                {analyzer.selectedNode.is_project ? (
                  <div className="inline-flex items-center gap-1 rounded-md bg-sky-500/12 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                    <FolderKanban className="size-3" />
                    {t("atmosProject")}
                  </div>
                ) : null}
                {analyzer.selectedNode.path !== analyzer.scanPath &&
                analyzer.selectedNode.name !== "__other__" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-1 w-full rounded-xl"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    {t("delete")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("selectNode")}</p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("children")}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {analyzer.childList.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {analyzer.isLevelLoading ? t("loadingLevel") : t("noChildren")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {analyzer.childList.map((child, index) => {
                    const share =
                      parentSize > 0 ? Math.min(100, (child.size / parentSize) * 100) : 0;
                    const selected = analyzer.selectedPath === child.path;
                    return (
                      <button
                        key={`${child.path}::${child.name}::${index}`}
                        type="button"
                        className={cn(
                          "group relative flex w-full flex-col gap-1 overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors",
                          selected ? "bg-muted" : "hover:bg-muted/50",
                          child.is_project && "ring-1 ring-inset ring-sky-500/30",
                        )}
                        onClick={() => {
                          analyzer.setSelectedPath(child.path);
                          if (child.is_dir && child.name !== "__other__") {
                            analyzer.drillTo(child.path);
                          }
                        }}
                      >
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/[0.04]"
                          style={{ width: `${share}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">
                            {child.name === "__other__" ? t("other") : child.name}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {formatBytes(child.size)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {analyzer.suggestions.length > 0 ? (
              <div className="border-t border-border/50 px-3 py-3">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("suggestions")}
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {analyzer.suggestions.slice(0, 6).map((tip) => (
                    <button
                      key={tip.path}
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                      onClick={() => analyzer.drillTo(tip.path)}
                    >
                      <div className="truncate text-xs font-medium">{tip.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatBytes(tip.size)} · {tip.reason}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDescription", {
                path: analyzer.selectedNode?.path ?? "",
                size: formatBytes(analyzer.selectedNode?.size ?? 0),
              })}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={permanent}
              onCheckedChange={(checked) => setPermanent(checked === true)}
            />
            {t("permanentDelete")}
          </label>
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
              {permanent ? t("confirmPermanent") : t("confirmTrash")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function shortenPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return `…${path.slice(-max + 1)}`;
  return `…/${parts.slice(-2).join("/")}`;
}

/** True for `/Users/<name>` or `/home/<name>` (the home directory itself). */
function isHomeRootPath(path: string): boolean {
  if (!path) return false;
  const parts = path.split("/").filter(Boolean);
  return (parts[0] === "Users" || parts[0] === "home") && parts.length === 2;
}

function isAtmosOverviewPath(path: string): boolean {
  return path === "atmos://disk-usage" || path.startsWith("atmos://");
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
): string {
  if (node.name === "__other__") return otherLabel;
  if (isAtmosOverviewPath(node.path) || node.name === "Atmos") return atmosLabel;
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
  return node.name;
}

/** Show `~` / Atmos for the scan root path; otherwise the real absolute path. */
function displayNodePath(
  path: string,
  scanPath: string,
  homeLabel: string,
  atmosLabel: string,
): string {
  if (isAtmosOverviewPath(path)) return atmosLabel;
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
  return path;
}
