"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
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
  onDeleteOne: (item: CleanupSuggestion) => void;
  onDeleteAll: () => void;
  onDeleteGroup: (items: CleanupSuggestion[]) => void;
}) {
  const t = useTranslations("DiskAnalyzer");
  const groups = useMemo(() => groupClearSuggestions(suggestions), [suggestions]);
  const totalSize = suggestionTotalSize(suggestions);

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
            disabled={deleting}
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
            {groups.map((group) => (
              <section key={group.kind} className="min-w-0">
                <div className="flex items-center gap-1.5 px-1 pb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{kindLabel(group.kind, t)}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t("suggestCount", { count: group.items.length })}
                      <span className="px-1 text-muted-foreground/50">·</span>
                      <span className="tabular-nums">{formatBytes(group.size)}</span>
                      {idleRangeLabel(group.minIdleDays, group.maxIdleDays, t) ? (
                        <>
                          <span className="px-1 text-muted-foreground/50">·</span>
                          {idleRangeLabel(group.minIdleDays, group.maxIdleDays, t)}
                        </>
                      ) : null}
                    </p>
                  </div>
                  {group.items.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-6 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={deleting}
                      aria-label={t("suggestDeleteGroup")}
                      title={t("suggestDeleteGroup")}
                      onClick={() => onDeleteGroup(group.items)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {group.buckets.map((bucket) => {
                    const merged = bucket.items.length > 1;
                    return (
                      <div key={`${group.kind}:${bucket.name.toLowerCase()}`}>
                        {merged ? (
                          <p className="px-1 pb-0.5 text-[11px] font-medium text-muted-foreground">
                            {localizeName(bucket.name)}
                            <span className="px-1 text-muted-foreground/50">·</span>
                            <span className="tabular-nums">{formatBytes(bucket.size)}</span>
                          </p>
                        ) : null}
                        <div className={cn(merged && "space-y-px")}>
                          {bucket.items.map((item) => (
                            <SuggestRow
                              key={item.path}
                              item={item}
                              hideName={merged}
                              deleting={deleting}
                              localizeName={localizeName}
                              pathTitle={pathTitle}
                              onDelete={() => onDeleteOne(item)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
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
  hideName,
  deleting,
  localizeName,
  pathTitle,
  onDelete,
}: {
  item: CleanupSuggestion;
  hideName: boolean;
  deleting: boolean;
  localizeName: (name: string) => string;
  pathTitle: (path: string) => string;
  onDelete: () => void;
}) {
  const t = useTranslations("DiskAnalyzer");
  const location = pathTitle(suggestLocationRaw(item));
  const idle = suggestIdleDays(item.last_activity_ms);
  return (
    <div className="flex items-start gap-1 rounded-md px-1 py-1 hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        {hideName ? null : (
          <p className="truncate text-xs font-medium" title={pathTitle(item.path)}>
            {localizeName(item.name)}
          </p>
        )}
        <p
          className="truncate text-[11px] text-muted-foreground"
          title={pathTitle(item.path)}
          style={{ direction: "rtl", textAlign: "left" }}
        >
          <bdi style={{ unicodeBidi: "plaintext" }}>{location}</bdi>
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatBytes(item.size)}
          {idle != null ? (
            <>
              <span className="px-1 text-muted-foreground/50">·</span>
              {t("suggestIdleDays", { days: idle })}
            </>
          ) : null}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-6 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        disabled={deleting}
        aria-label={t("deleteItem")}
        title={t("deleteItem")}
        onClick={onDelete}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

function kindLabel(
  kind: CleanupKind,
  t: ReturnType<typeof useTranslations<"DiskAnalyzer">>,
): string {
  if (t.has(`suggestKind.${kind}`)) {
    return t(`suggestKind.${kind}`);
  }
  return t("suggestKind.cache");
}

function idleRangeLabel(
  min: number | null,
  max: number | null,
  t: ReturnType<typeof useTranslations<"DiskAnalyzer">>,
): string | null {
  if (min == null || max == null) return null;
  if (min === max) return t("suggestIdleDays", { days: min });
  return t("suggestIdleRange", { min, max });
}
