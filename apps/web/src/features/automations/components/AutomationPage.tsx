"use client";

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";

import { AutomationHistoryPage } from "@/features/automations/components/AutomationHistoryPage";
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
        ) : state.pageView === "history" ? (
          <motion.div
            key={pageKey}
            className="absolute inset-0"
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, x: 34, scale: 0.992, filter: "blur(3px)" }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, x: 28, scale: 0.992, filter: "blur(3px)" }
            }
            transition={transition}
          >
            <AutomationHistoryPage
              automation={state.selectedAutomation}
              detail={state.selectedDetail}
              detailLoading={state.detailLoading}
              runs={state.runs}
              runsLoading={state.runsLoading}
              selectedRun={state.selectedRun}
              selectedRunGuid={state.selectedRunGuid}
              artifact={state.artifact}
              artifactLoading={state.artifactLoading}
              busyAction={state.busyAction}
              projects={state.projects}
              agents={state.agents}
              onBack={state.openList}
              standaloneChatOpen={state.standaloneChatOpen}
              onCloseStandaloneChat={state.closeStandaloneChat}
              onRefreshRuns={() => state.selectedAutomationGuid && void state.loadRuns(state.selectedAutomationGuid)}
              onRunAction={state.handleDefinitionAction}
              onSelectRun={state.setSelectedRunGuid}
              onCancelRun={state.handleCancelRun}
              onFetchArtifact={state.handleArtifactFetch}
              onContinueInTerminal={state.handleContinueInTerminal}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            className="absolute inset-0"
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
              targetFilter={state.targetFilter}
              searchQuery={state.searchQuery}
              onReload={state.handleReload}
              onCreate={state.openCreate}
              onEdit={state.openEdit}
              onOpenHistory={state.openHistory}
              onTargetFilterChange={(value) => void state.setTargetFilter(value)}
              onSearchQueryChange={(value) => void state.setSearchQuery(value)}
              onRunAction={state.handleDefinitionAction}
              onToggleEnabled={state.handleToggleEnabled}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
