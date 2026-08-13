"use client";

import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui";
import { Loader2, Trash2 } from "lucide-react";
import type { CleanupKind, CleanupSuggestion } from "@/api/ws/disk-analyzer-api";
import { formatBytes } from "@/features/disk-analyzer/lib/tree-adapters";

export function DiskAnalyzerSuggestPanel({
  suggestions,
  ready,
  scanning,
  deleting,
  localizeName,
  pathTitle,
  onDeleteOne,
  onDeleteAll,
}: {
  suggestions: CleanupSuggestion[];
  ready: boolean;
  scanning: boolean;
  deleting: boolean;
  localizeName: (name: string) => string;
  pathTitle: (path: string) => string;
  onDeleteOne: (item: CleanupSuggestion) => void;
  onDeleteAll: () => void;
}) {
  const t = useTranslations("DiskAnalyzer");
  const totalSize = suggestions.reduce((sum, item) => sum + (item.size ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {suggestions.length > 0 ? (
        <div className="flex shrink-0 items-center justify-end px-3 pb-1.5 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:text-destructive"
            disabled={deleting}
            onClick={onDeleteAll}
          >
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {t("deleteAllSuggest")}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {suggestions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {ready || !scanning ? t("suggestEmpty") : t("suggestScanning")}
          </p>
        ) : (
          <div className="space-y-1.5">
            {suggestions.map((item) => {
              const kind = item.kind ?? "cache";
              const idle = idleDaysLabel(item.last_activity_ms, t);
              return (
                <div
                  key={item.path}
                  className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-2"
                >
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs font-medium"
                        title={pathTitle(item.path)}
                      >
                        {localizeName(item.name)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {kindLabel(kind, t)}
                        <span className="px-1 text-muted-foreground/50">·</span>
                        {formatBytes(item.size)}
                        {idle ? (
                          <>
                            <span className="px-1 text-muted-foreground/50">·</span>
                            {idle}
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
                      onClick={() => onDeleteOne(item)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!ready || scanning ? (
              <p className="px-1 pt-1 text-[11px] leading-snug text-muted-foreground">
                {t("suggestScanning")}
              </p>
            ) : null}
            {suggestions.length > 1 ? (
              <p className="px-1 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {formatBytes(totalSize)}
              </p>
            ) : null}
          </div>
        )}
      </div>
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

function idleDaysLabel(
  lastActivityMs: number | null | undefined,
  t: ReturnType<typeof useTranslations<"DiskAnalyzer">>,
): string | null {
  if (!lastActivityMs || lastActivityMs <= 0) return null;
  const days = Math.max(1, Math.floor((Date.now() - lastActivityMs) / 86_400_000));
  return t("suggestIdleDays", { days });
}

