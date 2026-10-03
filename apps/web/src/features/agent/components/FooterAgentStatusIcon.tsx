"use client";

import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import { getWorkspaceAgentGroupMeta } from "@/app-shell/sidebar/workspace-status";
import { AgentStatusIndicator } from "@/features/agent/components/AgentStatusIndicator";
import {
  footerAgentStatusLabel,
  footerAgentStatusTextClass,
  type FooterAgentOverviewBucket,
} from "@/features/agent/lib/footer-agent-overview";
import { AGENT_STATE } from "@/features/agent/store/agent-status-store";

/** Icon used by the footer Agent status overview and session rows. */
export function FooterAgentStatusIcon({
  bucket,
}: {
  bucket: FooterAgentOverviewBucket;
}) {
  if (bucket === "running") {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center">
        <AgentStatusIndicator
          state={AGENT_STATE.RUNNING}
          variant="compact"
          placement="footer"
        />
      </span>
    );
  }
  const meta = getWorkspaceAgentGroupMeta(bucket === "idle" ? "done" : bucket);
  const Icon = meta.icon;
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center">
      <Icon className={cn("size-3.5", meta.className)} />
    </span>
  );
}

/** Footer Agent status icon plus the footer label. */
export function FooterAgentStatusMark({
  bucket,
}: {
  bucket: FooterAgentOverviewBucket;
}) {
  const t = useTranslations("appShell");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      <FooterAgentStatusIcon bucket={bucket} />
      <span className={footerAgentStatusTextClass(bucket)}>
        {footerAgentStatusLabel(t, bucket)}
      </span>
    </span>
  );
}
