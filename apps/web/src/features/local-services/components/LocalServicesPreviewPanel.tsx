"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { Button, cn } from "@workspace/ui";

import type { LocalService } from "@/features/local-services/types";
import { localServiceOpenUrl } from "@/features/local-services/lib/local-service-url";
import {
  localServicesScopeKey,
  useLocalServicesStore,
} from "@/features/local-services/store/local-services-store";
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
  const request = React.useMemo(
    () => ({
      scope: "current_context" as const,
      project_id: projectId ?? null,
      workspace_id: workspaceId ?? null,
    }),
    [projectId, workspaceId],
  );
  const key = localServicesScopeKey(request);
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const scan = useLocalServicesStore((s) => s.scan);
  const scope = useLocalServicesStore((s) => s.scopes[key]);
  const services = scope?.data?.services ?? [];
  const loading = scope?.loading ?? false;
  const error = scope?.error ?? scope?.data?.unavailable?.message ?? null;

  const refresh = React.useCallback((force = false) => {
    if (connectionState !== "connected") return;
    void scan({ ...request, force });
  }, [connectionState, request, scan]);

  React.useEffect(() => {
    if (connectionState !== "connected") return;
    refresh(false);
    const timer = window.setInterval(() => refresh(false), 30_000);
    return () => window.clearInterval(timer);
  }, [connectionState, refresh]);

  const handleOpen = React.useCallback((service: LocalService) => {
    const openUrl = localServiceOpenUrl(service);
    if (openUrl) onOpenUrl(openUrl);
  }, [onOpenUrl]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Local Services</div>
          <div className="text-xs text-muted-foreground">
            Services detected for this Project or Workspace.
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => refresh(true)}
          disabled={loading || connectionState !== "connected"}
          title="Refresh Local Services"
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
        emptyLabel="No Local Services for this context."
        onOpen={handleOpen}
        onRefresh={() => refresh(true)}
      />
    </section>
  );
}
