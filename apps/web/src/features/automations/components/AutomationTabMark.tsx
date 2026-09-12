"use client";

import { ALL_AUTOMATION_RUNS_KEY } from "@/features/automations/lib/automations-query-options";
import { useAutomationRunListQuery } from "@/features/automations/hooks/use-automations-query";
import { AutomationChip } from "@/features/automations/components/AutomationChip";
import {
  resolveAutomationTabMark,
  type AutomationTabMarkSurface,
} from "@/features/automations/lib/automation-tab-mark";

export function AutomationTabMark({
  surface,
  compact = true,
}: {
  surface: AutomationTabMarkSurface;
  compact?: boolean;
}) {
  const runsQuery = useAutomationRunListQuery(ALL_AUTOMATION_RUNS_KEY);
  const match = resolveAutomationTabMark(surface, runsQuery.data?.runs ?? []);
  if (!match) return null;
  return <AutomationChip compact={compact} tooltip={match.tooltip} />;
}
