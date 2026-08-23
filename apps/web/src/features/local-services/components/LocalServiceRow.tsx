"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, Square, Terminal } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  cn,
} from "@workspace/ui";

import type { LocalService } from "@/features/local-services/types";

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  probing: "bg-amber-500",
  not_http: "bg-neutral-500",
  stale: "bg-neutral-600",
  protected: "bg-neutral-500",
  unsupported: "bg-neutral-600",
};

interface LocalServiceRowProps {
  service: LocalService;
  compact?: boolean;
  showOwner?: boolean;
  stopPending?: boolean;
  onOpen?: (service: LocalService) => void;
  onStop?: (service: LocalService) => void | Promise<void>;
}

export function LocalServiceRow({
  service,
  compact = false,
  showOwner = false,
  stopPending = false,
  onOpen,
  onStop,
}: LocalServiceRowProps) {
  const t = useTranslations("LocalServices.components");
  const [stopConfirmOpen, setStopConfirmOpen] = React.useState(false);
  const title = service.title?.trim() || service.display_url || `localhost:${service.port}`;
  const ownerName =
    service.owner.workspace_name || service.owner.project_name || service.owner.root_path;
  const subtitle = showOwner ? `${ownerName} / ${service.display_url}` : service.display_url;
  const dot = STATUS_DOT[service.status] ?? STATUS_DOT.unsupported;
  const openable = Boolean(service.can_open && service.url && onOpen);

  const confirmStop = React.useCallback(async () => {
    if (!onStop || stopPending) return;
    await onStop(service);
    setStopConfirmOpen(false);
  }, [onStop, service, stopPending]);

  return (
    <div
      className={cn(
        "group grid min-h-[76px] grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2 hover:bg-muted/40",
        compact && "min-h-[76px] grid-cols-[88px_minmax(0,1fr)_auto] gap-3 px-3 py-2.5",
      )}
    >
      <button
        type="button"
        className={cn(
          "relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50",
          compact && "h-14 w-[88px]",
          openable && "cursor-pointer hover:border-foreground/30",
        )}
        onClick={() => {
          if (openable) onOpen?.(service);
        }}
        disabled={!openable}
        title={openable ? t("row.openTitle", { url: service.display_url }) : service.display_url}
      >
        <div className="absolute left-2 top-2 flex gap-1">
          <span className="size-1.5 rounded-full bg-red-400" />
          <span className="size-1.5 rounded-full bg-amber-400" />
          <span className="size-1.5 rounded-full bg-emerald-400" />
        </div>
        <div className={cn("mt-3.5 w-[72%] space-y-1.5", compact && "space-y-1")}>
          <div
            className={cn(
              "truncate text-[8px] font-semibold leading-none text-foreground",
              compact && "text-[8px]",
            )}
          >
            {service.display_url}
          </div>
          <div className="space-y-1">
            <Skeleton className={cn("h-1.5 w-full rounded bg-muted-foreground/25", compact && "h-1")} />
            <Skeleton
              className={cn("h-1.5 w-2/3 rounded bg-muted-foreground/25", compact && "h-1 w-1/2")}
            />
          </div>
        </div>
      </button>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground" title={title}>
          {title}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={subtitle}>
          {subtitle}
        </div>
        {service.process_name || service.launch_dir_display ? (
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/80">
            <Terminal className="size-3 shrink-0" />
            <span className="truncate" title={service.command_preview ?? undefined}>
              {[service.process_name, service.launch_dir_display].filter(Boolean).join(" · ")}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", dot)} title={service.status} />
        {openable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            title={t("common.open")}
            onClick={() => onOpen?.(service)}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        ) : null}
        {service.can_stop && onStop ? (
          <Popover
            open={stopConfirmOpen}
            onOpenChange={(open) => {
              if (!stopPending) setStopConfirmOpen(open);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                title={t("row.stopService")}
                aria-label={t("row.stopServiceAria", { title })}
                disabled={stopPending}
              >
                {stopPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Square className="size-3.5" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" align="center" className="w-60 space-y-3 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t("row.stopConfirmTitle")}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.rich("row.stopConfirmDescription", {
                    url: service.display_url,
                    port: service.port,
                    strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                  })}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setStopConfirmOpen(false)}
                  disabled={stopPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void confirmStop()}
                  disabled={stopPending}
                >
                  {stopPending ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
                  {t("row.stop")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}
