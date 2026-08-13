"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Loader2, Trash2 } from "lucide-react";
import type { CleanupKind, CleanupSuggestion } from "@/api/ws/disk-analyzer-api";
import {
  formatBytes,
  groupClearSuggestions,
  suggestIdleDays,
  suggestLocationRaw,
  suggestionTotalSize,
} from "@/features/disk-analyzer/lib/tree-adapters";

export function DiskAnalyzerSuggestPanel({
  suggestions,
  ready,
  scanning,
  deleting,
  localizeName,
  pathTitle,
  onOpenItem,
  onDeleteOne,
  onDeleteAll,
  onDeleteGroup,
}: {
  suggestions: CleanupSuggestion[];
  ready: boolean;
  scanning: boolean;
  deleting: boolean;
  localizeName: (name: string) => string;
  pathTitle: (path: string) => string;
  onOpenItem: (item: CleanupSuggestion) => void;
  onDeleteOne: (item: CleanupSuggestion) => void;
  onDeleteAll: () => void;
  onDeleteGroup: (items: CleanupSuggestion[]) => void;
}) {
  const t = useTranslations("DiskAnalyzer");
  const groups = useMemo(() => groupClearSuggestions(suggestions), [suggestions]);
  const totalSize = suggestionTotalSize(suggestions);
  const actionsLocked = deleting || scanning;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {suggestions.length > 0 ? (
        <div className="flex shrink-0 items-start justify-between gap-2 px-3 pb-2 pt-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold tabular-nums">{formatBytes(totalSize)}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("suggestCount", { count: suggestions.length })}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 rounded-full px-2.5 text-xs text-muted-foreground hover:text-destructive"
            disabled={actionsLocked}
            onClick={onDeleteAll}
          >
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {t("deleteAllSuggest")}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {suggestions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {ready || !scanning ? t("suggestEmpty") : t("suggestScanning")}
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const rows = group.buckets.flatMap((bucket) => bucket.items);
              const nameCounts = countNames(rows);
              return (
                <section key={group.kind} className="min-w-0">
                  <div className="flex items-center gap-1.5 px-1 pb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{kindLabel(group.kind, t)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t("suggestCount", { count: group.items.length })}
                        <span className="px-1 text-muted-foreground/50">·</span>
                        <span className="tabular-nums">{formatBytes(group.size)}</span>
                      </p>
                    </div>
                    {group.items.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={actionsLocked}
                        aria-label={t("suggestDeleteGroup")}
                        title={t("suggestDeleteGroup")}
                        onClick={() => onDeleteGroup(group.items)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                    {rows.map((item, index) => (
                      <SuggestRow
                        key={item.path}
                        item={item}
                        showShortLocation={(nameCounts.get(item.name.toLowerCase()) ?? 0) > 1}
                        divided={index > 0}
                        locked={actionsLocked}
                        localizeName={localizeName}
                        pathTitle={pathTitle}
                        onOpen={() => onOpenItem(item)}
                        onDelete={() => onDeleteOne(item)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {!ready || scanning ? (
              <p className="px-1 pt-1 text-[11px] leading-snug text-muted-foreground">
                {t("suggestScanning")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestRow({
  item,
  showShortLocation,
  divided,
  locked,
  localizeName,
  pathTitle,
  onOpen,
  onDelete,
}: {
  item: CleanupSuggestion;
  showShortLocation: boolean;
  divided: boolean;
  locked: boolean;
  localizeName: (name: string) => string;
  pathTitle: (path: string) => string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("DiskAnalyzer");
  const idle = suggestIdleDays(item.last_activity_ms);
  const fullPath = pathTitle(item.path);
  const shortLocation = shortLocationLabel(item, pathTitle);
  return (
    <div className={divided ? "border-t border-border/50" : undefined}>
      <div
        role="button"
        tabIndex={0}
        className="group flex h-8 cursor-pointer items-center gap-1 overflow-hidden px-1.5 hover:bg-muted/50"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex min-w-0 flex-1 items-center px-1">
              <p className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium">{localizeName(item.name)}</span>
                {showShortLocation ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {shortLocation}
                  </span>
                ) : null}
              </p>
              <span className="sr-only">{fullPath}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs break-all">
            {fullPath}
          </TooltipContent>
        </Tooltip>
        <div className="relative z-10 flex shrink-0 items-center">
          <span className="text-[11px] tabular-nums text-muted-foreground transition-transform duration-200 ease-out">
            {formatBytes(item.size)}
            {idle != null ? (
              <>
                <span className="px-1 text-muted-foreground/50">·</span>
                {t("suggestIdleDays", { days: idle })}
              </>
            ) : null}
          </span>
          <div
            className={cn(
              "overflow-hidden transition-[width,margin,opacity] duration-200 ease-out",
              "ml-0 w-0 opacity-0 group-hover:ml-0.5 group-hover:w-6 group-hover:opacity-100",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 shrink-0 translate-x-2 text-muted-foreground transition-transform duration-200 ease-out hover:bg-destructive/10 hover:text-destructive group-hover:translate-x-0"
              disabled={locked}
              aria-label={t("deleteItem")}
              title={t("deleteItem")}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortLocationLabel(
  item: CleanupSuggestion,
  pathTitle: (path: string) => string,
): string {
  const location = pathTitle(suggestLocationRaw(item));
  const parts = location.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.at(-1) ?? location;
}

function countNames(items: CleanupSuggestion[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function kindLabel(
  kind: CleanupKind,
  t: ReturnType<typeof useTranslations<"DiskAnalyzer">>,
): string {
  if (t.has(`suggestKind.${kind}`)) {
    return t(`suggestKind.${kind}`);
  }
  return kind;
}
