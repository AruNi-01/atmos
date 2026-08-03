"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Loader2, Square } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
} from "@workspace/ui";

import type {
  LocalServiceProcessNode,
  LocalServiceStopResponse,
} from "@/api/ws/local-services-api";
import type { LocalService } from "@/features/local-services/types";

export interface LocalServiceStopEscalationState {
  service: LocalService;
  response: LocalServiceStopResponse;
}

interface LocalServiceStopEscalationDialogProps {
  state: LocalServiceStopEscalationState | null;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmTreeStop: (rootPid: number) => void | Promise<void>;
}

const HINT_KEYS = [
  "orphan_ppid",
  "no_tty",
  "respawned",
  "term_ignored_or_still_listening",
  "not_http_still_listen",
] as const;

export function LocalServiceStopEscalationDialog({
  state,
  pending = false,
  onOpenChange,
  onConfirmTreeStop,
}: LocalServiceStopEscalationDialogProps) {
  const t = useTranslations("LocalServices.components");
  const open = Boolean(state);
  const response = state?.response;
  // Backend chain is listener-first; UI shows parent → child.
  const tree = React.useMemo(
    () => [...(response?.process_tree ?? [])].reverse(),
    [response?.process_tree],
  );
  const recommended = response?.recommended_root_pid ?? null;
  const hints = response?.orphan_hints ?? [];
  const canTreeStop = typeof recommended === "number" && recommended > 1;

  const reasonLabel = React.useMemo(() => {
    if (!response?.reason) return t("escalation.reasonStillListening");
    if (response.reason === "respawned") return t("escalation.reasonRespawned");
    if (response.reason === "term_ignored") return t("escalation.reasonTermIgnored");
    return t("escalation.reasonStillListening");
  }, [response?.reason, t]);

  const hintLabels = React.useMemo(() => {
    const labels: string[] = [];
    for (const hint of hints) {
      if ((HINT_KEYS as readonly string[]).includes(hint)) {
        labels.push(t(`escalation.hints.${hint}` as "escalation.hints.orphan_ppid"));
      }
    }
    if (labels.length === 0) {
      labels.push(t("escalation.hints.term_ignored_or_still_listening"));
    }
    return labels;
  }, [hints, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(85vh,640px)] gap-4 overflow-hidden sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{t("escalation.title")}</DialogTitle>
          <DialogDescription className="text-left">
            {t("escalation.description", {
              url: state?.service.display_url ?? `localhost:${response?.port ?? ""}`,
              port: response?.port ?? state?.service.port ?? 0,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-foreground">{reasonLabel}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {hintLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">{t("escalation.processTree")}</p>
            {tree.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("escalation.processTreeEmpty")}</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/80 p-2 font-mono text-[11px]">
                {tree.map((node, index) => (
                  <ProcessTreeRow
                    key={`${node.pid}-${index}`}
                    node={node}
                    depth={index}
                    isRecommended={node.pid === recommended}
                    listenerLabel={t("escalation.listenerBadge")}
                    recommendedLabel={t("escalation.recommendedBadge")}
                    protectedLabel={t("escalation.protectedBadge")}
                  />
                ))}
              </div>
            )}
          </div>

          {canTreeStop ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t.rich("escalation.treeStopNote", {
                pid: recommended!,
                strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("escalation.noSafeRoot")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!canTreeStop || pending}
            onClick={() => {
              if (canTreeStop && recommended != null) {
                void onConfirmTreeStop(recommended);
              }
            }}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
            {t("escalation.stopProcessTree")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProcessTreeRow({
  node,
  depth,
  isRecommended,
  listenerLabel,
  recommendedLabel,
  protectedLabel,
}: {
  node: LocalServiceProcessNode;
  depth: number;
  isRecommended: boolean;
  listenerLabel: string;
  recommendedLabel: string;
  protectedLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 rounded px-1.5 py-1",
        isRecommended && "bg-destructive/10",
        node.is_listener && "bg-muted/50",
      )}
      style={{ paddingLeft: `${4 + Math.min(depth, 6) * 10}px` }}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">{node.pid}</span>
      <span className="min-w-0 flex-1 truncate text-foreground" title={node.command_preview}>
        {node.command_preview}
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        {node.is_listener ? (
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{listenerLabel}</span>
        ) : null}
        {isRecommended ? (
          <span className="rounded bg-destructive/15 px-1 text-[10px] text-destructive">
            {recommendedLabel}
          </span>
        ) : null}
        {node.protected ? (
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{protectedLabel}</span>
        ) : null}
      </span>
    </div>
  );
}
