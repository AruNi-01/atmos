"use client";

import { useTranslations } from "next-intl";
import {
  EmptyAction,
  IconPlus,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import type { AgentHookInstallReport } from "@/api/rest-api";
import { summarizeAgentHookInstall } from "@/features/agent/lib/agent-hook-tools";

export function ObserverInstallHooksButton({
  connected,
  installing,
  report,
  onInstall,
}: {
  connected: boolean;
  installing: boolean;
  report: AgentHookInstallReport | null;
  onInstall: () => void;
}) {
  const t = useTranslations("AgentObserver");
  const toolsT = useTranslations("settings.agentHookStatusCard");
  const summary = summarizeAgentHookInstall(report);
  const allInstalled = summary.allInstalled;
  const disabled = installing || !connected || allInstalled;
  const label = installing
    ? t("installing")
    : allInstalled
      ? t("hooksInstalled", { count: summary.total })
      : t("installHooks", { count: summary.total });
  const missingNames = summary.missingKeys.map((key) => toolsT(`tools.${key}`));

  const button = (
    <EmptyAction icon={allInstalled ? undefined : <IconPlus />} disabled={disabled} onClick={onInstall}>
      {label}
    </EmptyAction>
  );

  if (disabled || missingNames.length === 0) return button;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          <p className="mb-1">{t("installHooksMissing")}</p>
          <ul className="flex flex-col gap-0.5">
            {missingNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
