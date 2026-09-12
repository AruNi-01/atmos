"use client";

import * as React from "react";
import { Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";

import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { ALL_AUTOMATION_RUNS_KEY } from "@/features/automations/lib/automations-query-options";
import { useAutomationRunListQuery } from "@/features/automations/hooks/use-automations-query";
import type { AutomationRunSummary } from "@/features/automations/types";
import { invalidateAutomationRunQueries } from "@/features/automations/lib/automations-query-options";
import { getAtmosWebQueryClient } from "@/providers/app/query-client";
import { getComputerQueryScope } from "@/api/query/query-scope";

type StalePromptEvent = {
  automation_guid: string;
  run_guid: string;
  display_name: string;
  execute_mode: string;
  surface_scope_id?: string | null;
  surface_session_id?: string | null;
};

const CARD_CLASS =
  "flex w-80 flex-col rounded-2xl border border-border/60 bg-background/95 p-3.5 shadow-lg backdrop-blur-md";

function isVisibleStaleRun(run: AutomationRunSummary): boolean {
  return Boolean(
    run.status === "running" &&
      run.stale_prompted_at &&
      !run.stale_prompt_dismissed,
  );
}

export function AutomationStalePromptBanner({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations("automation.stalePrompt");
  const runsQuery = useAutomationRunListQuery(ALL_AUTOMATION_RUNS_KEY);
  const [livePrompts, setLivePrompts] = React.useState<StalePromptEvent[]>([]);
  const [dismissing, setDismissing] = React.useState<string | null>(null);

  React.useEffect(() => {
    const off = useWebSocketStore.getState().onEvent(
      "automation_stale_prompt",
      (event) => {
        const payload = event as StalePromptEvent;
        setLivePrompts((current) => {
          if (current.some((item) => item.run_guid === payload.run_guid)) {
            return current;
          }
          return [...current, payload];
        });
        const client = getAtmosWebQueryClient();
        invalidateAutomationRunQueries(client, getComputerQueryScope());
      },
    );
    return off;
  }, []);

  const fromRuns = (runsQuery.data?.runs ?? [])
    .filter(isVisibleStaleRun)
    .map((run) => ({
      automation_guid: run.automation_guid,
      run_guid: run.guid,
      display_name: run.terminal_display_name || run.guid,
      execute_mode: String(run.execute_mode ?? "terminal"),
      surface_scope_id: run.surface_scope_id,
      surface_session_id: run.surface_session_id,
    }));

  const prompts = [...fromRuns];
  for (const live of livePrompts) {
    if (!prompts.some((item) => item.run_guid === live.run_guid)) {
      prompts.push(live);
    }
  }

  const prompt = prompts[0];
  if (!prompt) return null;

  const dismiss = async () => {
    setDismissing(prompt.run_guid);
    try {
      await wsRequest("automation_run_stale_dismiss", {
        run_guid: prompt.run_guid,
      });
      setLivePrompts((current) =>
        current.filter((item) => item.run_guid !== prompt.run_guid),
      );
      const client = getAtmosWebQueryClient();
      invalidateAutomationRunQueries(client, getComputerQueryScope());
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div role="status" className={cn(CARD_CLASS, className)}>
      <div className="flex gap-2.5">
        <Timer className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-pretty text-foreground">
            {t("title", { name: prompt.display_name })}
          </p>
          <p className="text-[11px] leading-relaxed text-pretty text-muted-foreground">
            {t("body")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={dismissing === prompt.run_guid}
          onClick={() => void dismiss()}
        >
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}
