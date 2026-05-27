"use client";

import { AutomationPageShell } from "@/features/automations/components/AutomationPageShell";
import { AutomationSetup } from "@/features/automations/components/AutomationSetup";
import { useAutomationPageState } from "@/features/automations/hooks/use-automation-page-state";

export function AutomationPage() {
  const state = useAutomationPageState();

  if (state.setupMode) {
    return (
      <AutomationSetup
        mode={state.setupMode}
        initialAutomation={state.setupMode === "edit" ? state.selectedDetail : null}
        initialAutomationLoading={state.setupMode === "edit" && state.detailLoading}
        agents={state.agents}
        agentsLoading={state.loading}
        projects={state.projects}
        projectsLoading={state.isProjectsLoading}
        schedulePreview={state.schedulePreview}
        onCancel={() => state.setSetupMode(null)}
        onCreate={state.handleCreate}
        onUpdate={state.handleUpdate}
      />
    );
  }

  return (
    <AutomationPageShell
      automations={state.automations}
      agents={state.agents}
      loading={state.loading}
      error={state.error}
      selectedAutomationGuid={state.selectedAutomationGuid}
      selectedAutomation={state.selectedAutomation}
      selectedDetail={state.selectedDetail}
      detailLoading={state.detailLoading}
      runs={state.runs}
      runsLoading={state.runsLoading}
      selectedRun={state.selectedRun}
      selectedRunGuid={state.selectedRunGuid}
      artifact={state.artifact}
      artifactLoading={state.artifactLoading}
      busyAction={state.busyAction}
      projects={state.projects}
      onReload={state.handleReload}
      onCreate={() => state.setSetupMode("create")}
      onEdit={() => state.setSetupMode("edit")}
      onSelectAutomation={state.setSelectedAutomationGuid}
      onRefreshRuns={() => state.selectedAutomationGuid && void state.loadRuns(state.selectedAutomationGuid)}
      onRunAction={state.handleDefinitionAction}
      onSelectRun={state.setSelectedRunGuid}
      onCancelRun={state.handleCancelRun}
      onFetchArtifact={state.handleArtifactFetch}
    />
  );
}
