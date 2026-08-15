"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Server } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";

import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { localServiceOpenUrl } from "@/features/local-services/lib/local-service-url";
import { localServicesScanQueryOptions } from "@/features/local-services/lib/local-services-query-options";
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
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  // Auto-refresh is server-driven via `local_services_updated` (no client polling).
  const query = useLocalServicesScanQuery(FOOTER_REQUEST, {
    enabled: connectionState === "connected",
  });

  const services = query.data?.services ?? [];
  const loading = query.isFetching;
  const error = query.error
    ? (query.error instanceof Error ? query.error.message : t("errorFallback"))
    : (query.data?.unavailable?.message ?? null);

  const forceRefresh = React.useCallback(async () => {
    if (connectionState !== "connected") return;
    await queryClient.fetchQuery(
      localServicesScanQueryOptions(scope, connectionState, {
        ...FOOTER_REQUEST,
        force: true,
      }),
    );
  }, [connectionState, queryClient, scope]);

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
        <div className="max-h-[420px] overflow-y-auto p-3">
          {error ? (
            <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
              {error}
            </div>
          ) : null}
          <LocalServiceList
            services={services}
            grouped
            compact
            emptyLabel={label("emptyLabel")}
            onOpen={handleOpen}
            onRefresh={() => void forceRefresh()}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
