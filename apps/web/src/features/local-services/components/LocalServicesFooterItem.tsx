"use client";

import React from "react";
import { Loader2, RefreshCw, Server } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";

import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { LocalService } from "@/features/local-services/types";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  localServicesScopeKey,
  useLocalServicesStore,
} from "@/features/local-services/store/local-services-store";
import { LocalServiceList } from "./LocalServiceList";

const FOOTER_REQUEST = {
  scope: "all_atmos_projects" as const,
};

export function LocalServicesFooterItem() {
  const [open, setOpen] = React.useState(false);
  const router = useAppRouter();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const scan = useLocalServicesStore((s) => s.scan);
  const key = localServicesScopeKey(FOOTER_REQUEST);
  const scope = useLocalServicesStore((s) => s.scopes[key]);
  const services = scope?.data?.services ?? [];
  const loading = scope?.loading ?? false;
  const error = scope?.error ?? scope?.data?.unavailable?.message ?? null;

  const refresh = React.useCallback((force = false) => {
    if (connectionState !== "connected") return;
    void scan({ ...FOOTER_REQUEST, force });
  }, [connectionState, scan]);

  React.useEffect(() => {
    if (connectionState !== "connected") return;
    if (!scope?.data && !loading) {
      refresh(false);
    }
  }, [connectionState, loading, refresh, scope?.data]);

  React.useEffect(() => {
    if (!open || connectionState !== "connected") return;
    refresh(false);
    const timer = window.setInterval(() => refresh(false), 30_000);
    return () => window.clearInterval(timer);
  }, [connectionState, open, refresh]);

  const handleOpen = React.useCallback((service: LocalService) => {
    if (!service.url) return;
    const params = new URLSearchParams();
    params.set("rsTab", "run-preview");
    params.set("pvUrl", service.url);
    if (service.owner.workspace_id) {
      params.set("id", service.owner.workspace_id);
      router.push(`/workspace?${params.toString()}`);
    } else if (service.owner.project_id) {
      params.set("id", service.owner.project_id);
      router.push(`/project?${params.toString()}`);
    } else {
      window.open(service.url, "_blank", "noopener,noreferrer");
    }
    setOpen(false);
  }, [router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title="Local Services"
          onMouseEnter={() => refresh(false)}
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Server className="size-3" />
          )}
          <span className="font-medium">LOCAL {services.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[420px] p-0">
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">Local Services</div>
              <div className="truncate text-[10px] text-muted-foreground">
                Atmos Project/Workspace services
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => refresh(true)}
              disabled={loading || connectionState !== "connected"}
              title="Refresh"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
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
            emptyLabel="No Project or Workspace services found."
            onOpen={handleOpen}
            onRefresh={() => refresh(true)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
