"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Server } from "lucide-react";
import { cn, toastManager } from "@workspace/ui";

import type { LocalService } from "@/features/local-services/types";
import { localServicesApi } from "@/api/ws/local-services-api";
import { LocalServiceRow } from "./LocalServiceRow";
import {
  LocalServiceStopEscalationDialog,
  type LocalServiceStopEscalationState,
} from "./LocalServiceStopEscalationDialog";

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
  emptyLabel,
  showOwner = false,
  onOpen,
  onRefresh,
}: LocalServiceListProps) {
  const t = useTranslations("LocalServices.components");
  const [stoppingId, setStoppingId] = React.useState<string | null>(null);
  const [escalation, setEscalation] = React.useState<LocalServiceStopEscalationState | null>(null);
  const [treePending, setTreePending] = React.useState(false);

  const handleStop = React.useCallback(
    async (service: LocalService) => {
      if (!service.pid) return;
      // Serialize escalations: ignore new stops while a dialog is open so
      // concurrent stops cannot clobber each other's escalation payload.
      if (escalation || treePending) return;

      setStoppingId(service.id);
      try {
        const result = await localServicesApi.stop({
          service_id: service.id,
          pid: service.pid,
          port: service.port,
          project_id: service.owner.project_id,
          workspace_id: service.owner.workspace_id,
          mode: "listener",
        });
        if (result.ok) {
          onRefresh?.();
          return;
        }
        if (result.needs_escalation) {
          setEscalation((current) => current ?? { service, response: result });
          return;
        }
        toastManager.add({
          type: "error",
          title: t("list.failedToStopTitle"),
          description: t("list.stopDidNotClear"),
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: t("list.failedToStopTitle"),
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setStoppingId(null);
      }
    },
    [escalation, onRefresh, t, treePending],
  );

  const handleTreeStop = React.useCallback(
    async (rootPid: number) => {
      if (!escalation) return;
      const { service, response } = escalation;
      const listenerPid =
        response.current_listener_pid ?? service.pid ?? response.attempted_pid ?? null;
      if (!listenerPid) return;

      setTreePending(true);
      try {
        const result = await localServicesApi.stop({
          service_id: response.service_id || service.id,
          pid: listenerPid,
          port: response.port ?? service.port,
          project_id: service.owner.project_id,
          workspace_id: service.owner.workspace_id,
          mode: "tree",
          root_pid: rootPid,
        });
        if (result.ok) {
          setEscalation(null);
          onRefresh?.();
          return;
        }
        toastManager.add({
          type: "error",
          title: t("list.failedToStopTitle"),
          description: t("list.stopDidNotClear"),
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: t("list.failedToStopTitle"),
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setTreePending(false);
      }
    },
    [escalation, onRefresh, t],
  );

  const listBody =
    services.length === 0 ? (
      <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-5 text-center">
        <Server className="size-5 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium text-foreground">{emptyLabel ?? t("list.emptyLabel")}</div>
        <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {t("list.emptyDescription")}
        </div>
      </div>
    ) : !grouped ? (
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
    ) : (
      <div className="space-y-4">
        {groupServices(services).map((group) => (
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

  return (
    <>
      {listBody}
      <LocalServiceStopEscalationDialog
        state={escalation}
        pending={treePending}
        onOpenChange={(open) => {
          if (!open && !treePending) setEscalation(null);
        }}
        onConfirmTreeStop={handleTreeStop}
      />
    </>
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
