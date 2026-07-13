"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button, cn } from "@workspace/ui";

import type { LocalService } from "@/features/local-services/types";
import { localServiceOpenUrl } from "@/features/local-services/lib/local-service-url";
import { useLocalServicesScanQuery } from "@/features/local-services/hooks/use-local-services-query";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
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
  const request = React.useMemo(
    () => ({
      scope: "current_context" as const,
      project_id: projectId ?? null,
      workspace_id: workspaceId ?? null,
    }),
    [projectId, workspaceId],
  );
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const query = useLocalServicesScanQuery(request, {
    enabled: connectionState === "connected",
    refetchInterval: 30_000,
  });

  const services = query.data?.services ?? [];
  const loading = query.isFetching;
  const error = query.error
    ? (query.error instanceof Error ? query.error.message : t("preview.errorFallback"))
    : (query.data?.unavailable?.message ?? null);

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
          onClick={() => void query.refetch()}
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
        onRefresh={() => void query.refetch()}
      />
    </section>
  );
}
