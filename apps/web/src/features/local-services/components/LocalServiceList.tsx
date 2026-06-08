"use client";

import React from "react";
import { Server } from "lucide-react";
import { cn, toastManager } from "@workspace/ui";

import type { LocalService } from "@/features/local-services/types";
import { localServicesApi } from "@/api/ws/local-services-api";
import { LocalServiceRow } from "./LocalServiceRow";

interface LocalServiceListProps {
  services: LocalService[];
  grouped?: boolean;
  compact?: boolean;
  emptyLabel?: string;
  showOwner?: boolean;
  onOpen?: (service: LocalService) => void;
  onRefresh?: () => void;
}

export function LocalServiceList({
  services,
  grouped = false,
  compact = false,
  emptyLabel = "No Local Services detected.",
  showOwner = false,
  onOpen,
  onRefresh,
}: LocalServiceListProps) {
  const [stoppingId, setStoppingId] = React.useState<string | null>(null);

  const handleStop = React.useCallback(async (service: LocalService) => {
    if (!service.pid) return;

    setStoppingId(service.id);
    try {
      await localServicesApi.stop({
        service_id: service.id,
        pid: service.pid,
        port: service.port,
        project_id: service.owner.project_id,
        workspace_id: service.owner.workspace_id,
      });
      onRefresh?.();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to stop service",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setStoppingId(null);
    }
  }, [onRefresh]);

  if (services.length === 0) {
    return (
      <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-5 text-center">
        <Server className="size-5 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium text-foreground">{emptyLabel}</div>
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Start a server inside this Project or Workspace, then refresh.
        </div>
      </div>
    );
  }

  if (!grouped) {
    return (
      <div className="space-y-2">
        {services.map((service) => (
          <div key={service.id} className={cn(stoppingId === service.id && "opacity-60")}>
            <LocalServiceRow
              service={service}
              compact={compact}
              showOwner={showOwner}
              stopPending={stoppingId === service.id}
              onOpen={onOpen}
              onStop={handleStop}
            />
          </div>
        ))}
      </div>
    );
  }

  const groups = groupServices(services);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">{group.label}</div>
              <div className="truncate text-[10px] text-muted-foreground">{group.rootPath}</div>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">{group.services.length}</span>
          </div>
          {group.services.map((service) => (
            <div key={service.id} className={cn(stoppingId === service.id && "opacity-60")}>
              <LocalServiceRow
                service={service}
                compact={compact}
                stopPending={stoppingId === service.id}
                onOpen={onOpen}
                onStop={handleStop}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function groupServices(services: LocalService[]) {
  const map = new Map<string, { key: string; label: string; rootPath: string; services: LocalService[] }>();
  for (const service of services) {
    const key = service.owner.workspace_id || service.owner.project_id || service.owner.root_path;
    const label = service.owner.workspace_name || service.owner.project_name || service.owner.root_path;
    const group = map.get(key) ?? {
      key,
      label,
      rootPath: service.owner.root_path,
      services: [],
    };
    group.services.push(service);
    map.set(key, group);
  }
  return Array.from(map.values());
}
