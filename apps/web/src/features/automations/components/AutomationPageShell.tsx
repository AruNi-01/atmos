import { AutomationListPanel } from "@/features/automations/components/AutomationListPanel";
import type {
  AutomationAgentCapability,
  AutomationSummary,
} from "@/features/automations/types";
import type { AutomationTargetFilter } from "@/shared/lib/nuqs/searchParams";
import type { Project } from "@/shared/types/domain";

export function AutomationPageShell({
  automations,
  agents,
  loading,
  error,
  busyAction,
  projects,
  targetFilter,
  searchQuery,
  onReload,
  onCreate,
  onEdit,
  onOpenHistory,
  onTargetFilterChange,
  onSearchQueryChange,
  onRunAction,
  onToggleEnabled,
}: {
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  error: string | null;
  busyAction: string | null;
  projects: Project[];
  targetFilter: AutomationTargetFilter;
  searchQuery: string;
  onReload: () => void;
  onCreate: () => void;
  onEdit: (guid: string) => void;
  onOpenHistory: (guid: string) => void;
  onTargetFilterChange: (value: AutomationTargetFilter) => void;
  onSearchQueryChange: (value: string) => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
  onToggleEnabled: (automation: AutomationSummary, enabled: boolean) => Promise<void>;
}) {
  const supportedAgentCount = agents.filter((agent) => agent.automation_supported).length;
  const newAutomationDisabled = loading || supportedAgentCount === 0;

  return (
    <AutomationListPanel
      automations={automations}
      agents={agents}
      loading={loading}
      error={error}
      supportedAgentCount={supportedAgentCount}
      createDisabled={newAutomationDisabled}
      busyAction={busyAction}
      projects={projects}
      targetFilter={targetFilter}
      searchQuery={searchQuery}
      onReload={onReload}
      onCreate={onCreate}
      onEdit={onEdit}
      onOpenHistory={onOpenHistory}
      onTargetFilterChange={onTargetFilterChange}
      onSearchQueryChange={onSearchQueryChange}
      onRunAction={onRunAction}
      onToggleEnabled={onToggleEnabled}
    />
  );
}
