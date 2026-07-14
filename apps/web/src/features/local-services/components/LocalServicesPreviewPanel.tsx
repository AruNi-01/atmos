"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button, cn } from "@workspace/ui";

import type { LocalService } from "@/features/local-services/types";
import { localServiceOpenUrl } from "@/features/local-services/lib/local-service-url";
import { useLocalServicesScanQuery } from "@/features/local-services/hooks/use-local-services-query";
import { localServicesScanQueryOptions } from "@/features/local-services/lib/local-services-query-options";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { LocalServiceList } from "./LocalServiceList";

interface LocalServicesPreviewPanelProps {
  projectId?: string | null;
  workspaceId?: string | null;
  onOpenUrl: (url: string) => void;
}

export function LocalServicesPreviewPanel({
  projectId,
  workspaceId,
  onOpenUrl,
}: LocalServicesPreviewPanelProps) {
  const t = useTranslations("LocalServices.components");
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const request = React.useMemo(
    () => ({
      scope: "current_context" as const,
      project_id: projectId ?? null,
      workspace_id: workspaceId ?? null,
    }),
    [projectId, workspaceId],
  );
  const query = useLocalServicesScanQuery(request, {
    enabled: connectionState === "connected",
    refetchInterval: 30_000,
  });

  const services = query.data?.services ?? [];
  const loading = query.isFetching;
  const error = query.error
    ? (query.error instanceof Error ? query.error.message : t("preview.errorFallback"))
    : (query.data?.unavailable?.message ?? null);

  const forceRefresh = React.useCallback(async () => {
    if (connectionState !== "connected") return;
    await queryClient.fetchQuery(
      localServicesScanQueryOptions(scope, connectionState, {
        ...request,
        force: true,
      }),
    );
  }, [connectionState, queryClient, request, scope]);

  const handleOpen = React.useCallback((service: LocalService) => {
    const openUrl = localServiceOpenUrl(service);
    if (openUrl) onOpenUrl(openUrl);
  }, [onOpenUrl]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{t("preview.title")}</div>
          <div className="text-xs text-muted-foreground">{t("preview.subtitle")}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => void forceRefresh()}
          disabled={loading || connectionState !== "connected"}
          title={t("preview.refreshTitle")}
        >
          <RotateCcw className={cn("size-4", loading && "animate-spin-reverse")} />
        </Button>
      </div>
      {error ? (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <LocalServiceList
        services={services}
        emptyLabel={t("preview.emptyLabel")}
        onOpen={handleOpen}
        onRefresh={() => void forceRefresh()}
      />
    </section>
  );
}
