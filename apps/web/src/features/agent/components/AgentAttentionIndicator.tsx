"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FilledBellIcon, cn } from "@workspace/ui";
import type { AttentionReason } from "@/features/agent/store/agent-attention-store";

/**
 * Subtle "needs attention" mark for sidebar / tabs / pane chrome.
 * Soft colors on purpose — not a loud alert badge.
 */
export function AgentAttentionIndicator({
  reason,
  className,
  size = 12,
}: {
  reason: AttentionReason;
  className?: string;
  size?: number;
}) {
  const t = useTranslations("Agent.attention");
  const isPermission = reason === "permission_request";
  const label = isPermission ? t("permissionNeeded") : t("taskComplete");
  return (
    <span
      role="img"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        isPermission ? "text-amber-500/80" : "text-emerald-500/80",
        className,
      )}
      title={label}
      aria-label={label}
    >
      <FilledBellIcon size={size} color="currentColor" strokeWidth={0} />
    </span>
  );
}

/** Soft ring for tab / pane containers that need attention. */
export function attentionBorderClass(reason: AttentionReason | null | undefined): string {
  if (!reason) return "";
  if (reason === "permission_request") {
    return "agent-attention-ring agent-attention-ring-permission";
  }
  return "agent-attention-ring agent-attention-ring-complete";
}
