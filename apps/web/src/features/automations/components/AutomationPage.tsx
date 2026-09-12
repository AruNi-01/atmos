"use client";

import { useLayoutEffect, useRef } from "react";
import { PushPageStack, usePushPageTransition } from "@workspace/ui";

import { AutomationPageShell } from "@/features/automations/components/AutomationPageShell";
import { AutomationSetup } from "@/features/automations/components/AutomationSetup";
import { useAutomationPageState } from "@/features/automations/hooks/use-automation-page-state";

export function AutomationPage() {
  const state = useAutomationPageState();
  const {
    phase: setupPhase,
    isPresented: setupPresented,
    open: openSetupPush,
    close: closeSetupPush,
  } = usePushPageTransition();
  const setupPhaseRef = useRef(setupPhase);
  setupPhaseRef.current = setupPhase;
  const wasSetupRef = useRef(false);
  const overlayModeRef = useRef(state.setupMode);
  if (state.setupMode) overlayModeRef.current = state.setupMode;

  useLayoutEffect(() => {
    const isSetup = Boolean(state.setupMode);
    const wasSetup = wasSetupRef.current;
    wasSetupRef.current = isSetup;

    if (isSetup && !wasSetup) {
      openSetupPush();
      return;
    }

    if (!isSetup && wasSetup && setupPhaseRef.current === "open") {
      closeSetupPush();
    }
  }, [closeSetupPush, openSetupPush, state.setupMode]);

  const overlayMode = state.setupMode ?? (setupPresented ? overlayModeRef.current : null);

  const handleCancelSetup = () => {
    closeSetupPush({
      onComplete: () => state.setSetupMode(null),
    });
  };

  const setupOverlay =
    overlayMode ? (
      <AutomationSetup
        mode={overlayMode}
        initialAutomation={overlayMode === "edit" ? state.selectedDetail : null}
        initialAutomationLoading={overlayMode === "edit" && state.detailLoading}
        agents={state.agents}
        projects={state.projects}
        projectsLoading={state.isProjectsLoading}
        schedulePreview={state.schedulePreview}
        onCancel={handleCancelSetup}
        onCreate={state.handleCreate}
        onUpdate={state.handleUpdate}
        onRunNow={state.runNow}
      />
    ) : null;

  return (
    <PushPageStack
      phase={setupPhase}
      className="h-full min-h-0"
      overlayClassName="bg-background shadow-none"
      overlayKey={overlayMode ?? "setup"}
      overlay={setupOverlay}
      base={
        <AutomationPageShell
          automations={state.automations}
          agents={state.agents}
          loading={state.loading}
          error={state.error}
          busyAction={state.busyAction}
          projects={state.projects}
          listTab={state.listTab}
          listFilters={state.listFilters}
          runFilters={state.runFilters}
          searchQuery={state.searchQuery}
          runs={state.runs}
          runsLoading={state.runsLoading}
          selectedRun={state.selectedRun}
          selectedRunGuid={state.selectedRunGuid}
          artifact={state.artifact}
          artifactLoading={state.artifactLoading}
          standaloneChatOpen={state.standaloneChatOpen}
          onCreate={state.openCreate}
          onEdit={state.openEdit}
          onListTabChange={(tab) => void state.setListTab(tab)}
          onListFiltersChange={state.setListFilters}
          onRunFiltersChange={state.setRunFilters}
          onSearchQueryChange={(value) => void state.setSearchQuery(value)}
          onSelectRun={state.setSelectedRunGuid}
          onViewRuns={state.openAutomationRuns}
          onCloseRun={state.clearRunSelection}
          onCloseStandaloneChat={state.closeStandaloneChat}
          onRunAction={state.handleDefinitionAction}
          onToggleEnabled={state.handleToggleEnabled}
          onCancelRun={state.handleCancelRun}
          onFetchArtifact={state.handleArtifactFetch}
          onContinueInTerminal={state.handleContinueInTerminal}
          onContinueInChat={state.handleContinueInChat}
          onOpenRunSurface={state.handleOpenRunSurface}
        />
      }
    />
  );
}
