import { AutomationListPanel } from "@/features/automations/components/AutomationListPanel";
import { AutomationRunDrawer } from "@/features/automations/components/AutomationRunDrawer";
import type { AutomationListFilters } from "@/features/automations/lib/automation-list-filters";
import type { AutomationRunListFilters } from "@/features/automations/lib/automation-run-filters";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationRunSummary,
  AutomationSummary,
} from "@/features/automations/types";
import type { AutomationsListTab } from "@/shared/lib/nuqs/searchParams";
import type { Project } from "@/shared/types/domain";

export function AutomationPageShell({
  automations,
  agents,
  loading,
  error,
  busyAction,
  projects,
  listTab,
  listFilters,
  runFilters,
  searchQuery,
  runs,
  runsLoading,
  selectedRun,
  selectedRunGuid,
  artifact,
  artifactLoading,
  standaloneChatOpen,
  onCreate,
  onEdit,
  onListTabChange,
  onListFiltersChange,
  onRunFiltersChange,
  onSearchQueryChange,
  onSelectRun,
  onViewRuns,
  onCloseRun,
  onCloseStandaloneChat,
  onRunAction,
  onToggleEnabled,
  onCancelRun,
  onFetchArtifact,
  onContinueInTerminal,
}: {
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  error: string | null;
  busyAction: string | null;
  projects: Project[];
  listTab: AutomationsListTab;
  listFilters: AutomationListFilters;
  runFilters: AutomationRunListFilters;
  searchQuery: string;
  runs: AutomationRunSummary[];
  runsLoading: boolean;
  selectedRun: AutomationRunSummary | null;
  selectedRunGuid: string | null;
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  standaloneChatOpen: boolean;
  onCreate: () => void;
  onEdit: (guid: string) => void;
  onListTabChange: (tab: AutomationsListTab) => void;
  onListFiltersChange: (filters: AutomationListFilters) => void;
  onRunFiltersChange: (filters: AutomationRunListFilters) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectRun: (guid: string) => void;
  onViewRuns: (guid: string) => void;
  onCloseRun: () => void;
  onCloseStandaloneChat: () => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
  onToggleEnabled: (automation: AutomationSummary, enabled: boolean) => Promise<void>;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
  onContinueInTerminal: (run: AutomationRunSummary) => Promise<void>;
}) {
  const supportedAgentCount = agents.filter((agent) => agent.automation_supported).length;
  const newAutomationDisabled = loading || supportedAgentCount === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AutomationListPanel
        automations={automations}
        agents={agents}
        loading={loading}
        error={error}
        supportedAgentCount={supportedAgentCount}
        createDisabled={newAutomationDisabled}
        busyAction={busyAction}
        projects={projects}
        listTab={listTab}
        listFilters={listFilters}
        runFilters={runFilters}
        searchQuery={searchQuery}
        runs={runs}
        runsLoading={runsLoading}
        selectedRunGuid={selectedRunGuid}
        onCreate={onCreate}
        onEdit={onEdit}
        onListTabChange={onListTabChange}
        onListFiltersChange={onListFiltersChange}
        onRunFiltersChange={onRunFiltersChange}
        onSearchQueryChange={onSearchQueryChange}
        onSelectRun={onSelectRun}
        onViewRuns={onViewRuns}
        onRunAction={onRunAction}
        onToggleEnabled={onToggleEnabled}
      />
      <AutomationRunDrawer
        run={selectedRun}
        open={Boolean(selectedRunGuid)}
        agents={agents}
        artifact={artifact}
        artifactLoading={artifactLoading}
        busyAction={busyAction}
        standaloneChatOpen={standaloneChatOpen}
        onClose={onCloseRun}
        onCloseStandaloneChat={onCloseStandaloneChat}
        onCancelRun={onCancelRun}
        onFetchArtifact={onFetchArtifact}
        onContinueInTerminal={onContinueInTerminal}
      />
    </div>
  );
}
