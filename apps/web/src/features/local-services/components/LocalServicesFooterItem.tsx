"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw, Server } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";

import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { localServiceOpenUrl } from "@/features/local-services/lib/local-service-url";
import type { LocalService } from "@/features/local-services/types";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useLocalServicesScanQuery } from "@/features/local-services/hooks/use-local-services-query";
import { LocalServiceList } from "./LocalServiceList";

const FOOTER_REQUEST = {
  scope: "all_atmos_projects" as const,
};

export function LocalServicesFooterItem() {
  const t = useTranslations("localServices.footerItem");
  const [open, setOpen] = React.useState(false);
  const router = useAppRouter();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const query = useLocalServicesScanQuery(FOOTER_REQUEST, {
    enabled: connectionState === "connected",
    refetchInterval: 30_000,
  });

  const services = query.data?.services ?? [];
  const loading = query.isFetching;
  const error = query.error
    ? (query.error instanceof Error ? query.error.message : t("errorFallback"))
    : (query.data?.unavailable?.message ?? null);

  const label = React.useCallback(
    (key: string, values?: Record<string, string | number>) =>
      t(key, values),
    [t]
  );

  const handleOpen = React.useCallback((service: LocalService) => {
    const openUrl = localServiceOpenUrl(service);
    if (!openUrl) return;
    const params = new URLSearchParams();
    params.set("rsTab", "browser");
    params.set("pvUrl", openUrl);
    if (service.owner.workspace_id) {
      params.set("id", service.owner.workspace_id);
      router.push(`/workspace?${params.toString()}`);
    } else if (service.owner.project_id) {
      params.set("id", service.owner.project_id);
      router.push(`/project?${params.toString()}`);
    } else {
      window.open(openUrl, "_blank", "noopener,noreferrer");
    }
    setOpen(false);
  }, [router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title={label("title")}
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Server className="size-3" />
          )}
          <span className="font-medium">
            {label("triggerLabel", { count: services.length })}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[420px] p-0">
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">
                {label("title")}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {label("subtitle")}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void query.refetch()}
              disabled={loading || connectionState !== "connected"}
              title={label("refresh")}
            >
              <RotateCcw className={cn("size-3.5", loading && "animate-spin-reverse")} />
            </Button>
          </div>
          {error ? (
            <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
              {error}
            </div>
          ) : null}
        </div>
        <div className="max-h-[420px] overflow-y-auto p-3">
          <LocalServiceList
            services={services}
            grouped
            compact
            emptyLabel={label("emptyLabel")}
            onOpen={handleOpen}
            onRefresh={() => void query.refetch()}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
