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
  Input,
  Label,
  cn,
} from "@workspace/ui";
import {
  HardDrive,
  Loader2,
  Search,
  Trash2,
  FolderKanban,
} from "lucide-react";
import { DiskUsageChart } from "@/features/disk-analyzer/components/DiskUsageChart";
import { useDiskAnalyzer } from "@/features/disk-analyzer/hooks/use-disk-analyzer";
import { formatBytes } from "@/features/disk-analyzer/lib/tree-adapters";

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
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex flex-col gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <HardDrive className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">{t("subtitle")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={analyzer.scanPath}
            onChange={(e) => analyzer.setScanPath(e.target.value)}
            placeholder={t("pathPlaceholder")}
            className="min-w-[280px] flex-1"
          />
          <Button onClick={() => void analyzer.startScan()} disabled={analyzer.busy}>
            {analyzer.busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("scan")}
          </Button>
          {analyzer.status === "running" ? (
            <Button variant="outline" onClick={() => void analyzer.cancelScan()}>
              {t("cancel")}
            </Button>
          ) : null}
          <div className="flex rounded-md border border-border p-0.5">
            <Button
              size="sm"
              variant={analyzer.chartMode === "sunburst" ? "secondary" : "ghost"}
              onClick={() => analyzer.setChartMode("sunburst")}
            >
              {t("sunburst")}
            </Button>
            <Button
              size="sm"
              variant={analyzer.chartMode === "treemap" ? "secondary" : "ghost"}
              onClick={() => analyzer.setChartMode("treemap")}
            >
              {t("treemap")}
            </Button>
          </div>
        </div>

        {analyzer.volume ? (
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              {t("freeSpace", {
                free: formatBytes(analyzer.volume.available_bytes),
                total: formatBytes(analyzer.volume.total_bytes),
              })}
            </span>
            {usedPercent !== null ? (
              <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    usedPercent > 90 ? "bg-destructive" : "bg-primary",
                  )}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {analyzer.status === "running" && analyzer.progress ? (
          <div className="text-sm text-muted-foreground">
            {t("scanning", {
              files: analyzer.progress.files_scanned,
              bytes: formatBytes(analyzer.progress.bytes_scanned),
              path: analyzer.progress.current_path ?? "…",
            })}
          </div>
        ) : null}
        {analyzer.error ? (
          <div className="text-sm text-destructive">{analyzer.error}</div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-3 border-r border-border p-4 overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={analyzer.filters.query}
              onChange={(e) =>
                analyzer.setFilters({ ...analyzer.filters, query: e.target.value })
              }
              placeholder={t("searchPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="min-size">{t("minSize")}</Label>
            <Input
              id="min-size"
              type="number"
              min={0}
              value={analyzer.filters.minSize || ""}
              onChange={(e) =>
                analyzer.setFilters({
                  ...analyzer.filters,
                  minSize: Number(e.target.value) || 0,
                })
              }
              placeholder="0"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={analyzer.filters.projectsOnly}
              onCheckedChange={(checked) =>
                analyzer.setFilters({
                  ...analyzer.filters,
                  projectsOnly: checked === true,
                })
              }
            />
            <FolderKanban className="size-4 text-sky-600" />
            {t("projectsOnly")}
          </label>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={analyzer.sortBy === "size" ? "secondary" : "outline"}
              onClick={() => analyzer.setSortBy("size")}
            >
              {t("sortSize")}
            </Button>
            <Button
              size="sm"
              variant={analyzer.sortBy === "name" ? "secondary" : "outline"}
              onClick={() => analyzer.setSortBy("name")}
            >
              {t("sortName")}
            </Button>
          </div>

          {analyzer.stats ? (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <div>{t("statsTotal", { size: formatBytes(analyzer.stats.total_size) })}</div>
              <div>
                {t("statsCounts", {
                  files: analyzer.stats.files_scanned,
                  dirs: analyzer.stats.dirs_scanned,
                })}
              </div>
            </div>
          ) : null}

          {analyzer.suggestions.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("suggestions")}
              </div>
              {analyzer.suggestions.slice(0, 8).map((tip) => (
                <button
                  key={tip.path}
                  type="button"
                  className="w-full rounded-md border border-border/60 px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                  onClick={() => {
                    analyzer.setSelectedPath(tip.path);
                    analyzer.setFocusPath(tip.path);
                  }}
                >
                  <div className="font-medium truncate">{tip.name}</div>
                  <div className="text-muted-foreground truncate">
                    {formatBytes(tip.size)} · {tip.reason}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {analyzer.breadcrumbs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2 text-sm">
              {analyzer.breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                  {index > 0 ? <span className="text-muted-foreground">/</span> : null}
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 hover:bg-muted"
                    onClick={() => analyzer.setFocusPath(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 p-4">
            {analyzer.focusedNode ? (
              <DiskUsageChart
                node={analyzer.focusedNode}
                rootSize={analyzer.stats?.total_size ?? analyzer.focusedNode.size}
                mode={analyzer.chartMode}
                projectLabel={t("atmosProject")}
                onSelectPath={analyzer.setSelectedPath}
                onDrillPath={analyzer.setFocusPath}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {analyzer.busy ? t("scanningWait") : t("empty")}
              </div>
            )}
          </div>
        </section>

        <aside className="flex w-80 shrink-0 flex-col border-l border-border p-4 overflow-y-auto gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("details")}
          </div>
          {analyzer.selectedNode ? (
            <div className="space-y-2 text-sm">
              <div className="font-medium break-all">{analyzer.selectedNode.name}</div>
              <div className="text-muted-foreground break-all text-xs">
                {analyzer.selectedNode.path}
              </div>
              <div>{formatBytes(analyzer.selectedNode.size)}</div>
              {analyzer.selectedNode.is_project ? (
                <div className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                  <FolderKanban className="size-3" />
                  {t("atmosProject")}
                </div>
              ) : null}
              <div className="text-muted-foreground text-xs">
                {t("counts", {
                  files: analyzer.selectedNode.file_count,
                  dirs: analyzer.selectedNode.dir_count,
                })}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t("selectNode")}</div>
          )}

          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-2">
            {t("children")}
          </div>
          <div className="space-y-1">
            {analyzer.childList.map((child) => (
              <button
                key={child.path}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60",
                  analyzer.selectedPath === child.path && "bg-muted",
                  child.is_project && "ring-1 ring-sky-500/40",
                )}
                onClick={() => {
                  analyzer.setSelectedPath(child.path);
                  if (child.is_dir) analyzer.setFocusPath(child.path);
                }}
              >
                <span className="truncate pr-2">{child.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatBytes(child.size)}
                </span>
              </button>
            ))}
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
