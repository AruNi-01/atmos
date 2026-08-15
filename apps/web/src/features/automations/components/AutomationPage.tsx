"use client";

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";

import { AutomationPageShell } from "@/features/automations/components/AutomationPageShell";
import { AutomationSetup } from "@/features/automations/components/AutomationSetup";
import { useAutomationPageState } from "@/features/automations/hooks/use-automation-page-state";

export function AutomationPage() {
  const state = useAutomationPageState();
  const shouldReduceMotion = useReducedMotion();

  const transition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.16, 1, 0.3, 1] };
  const pageKey = state.setupMode ? `setup-${state.setupMode}` : state.pageView;

  return (
    <div className="relative h-full overflow-hidden bg-background">
      <AnimatePresence mode="wait" initial={false}>
        {state.setupMode ? (
          <motion.div
            key={pageKey}
            className="absolute inset-0"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 26, scale: 0.985, filter: "blur(4px)" }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 18, scale: 0.99, filter: "blur(3px)" }
            }
            transition={transition}
          >
            <AutomationSetup
              mode={state.setupMode}
              initialAutomation={state.setupMode === "edit" ? state.selectedDetail : null}
              initialAutomationLoading={state.setupMode === "edit" && state.detailLoading}
              agents={state.agents}
              projects={state.projects}
              projectsLoading={state.isProjectsLoading}
              schedulePreview={state.schedulePreview}
              onCancel={() => state.setSetupMode(null)}
              onCreate={state.handleCreate}
              onUpdate={state.handleUpdate}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: -18, scale: 0.99, filter: "blur(3px)" }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -20, scale: 0.992, filter: "blur(3px)" }
            }
            transition={transition}
          >
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
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
