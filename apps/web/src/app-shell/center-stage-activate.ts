/**
 * Live center-tab activation. Paint-context stores are the source of truth;
 * URL `tab` is only a one-shot deep link consumed by CenterStage.
 */

import { attachCenterTab } from "@/app-shell/center-space/center-open-context";
import type { CenterTabAttachPlacement } from "@/app-shell/center-pane/center-pane-layout";
import { useOverviewCenterTabStore } from "@/app-shell/center-overview-tab";
import { recordCenterTabActivation } from "@/app-shell/center-stage-tab-activation-stack";
import { FIXED_TABS } from "@/app-shell/center-stage-fixed-tabs";
import {
  isCenterToolTabValue,
  useToolCenterTabsStore,
} from "@/app-shell/center-tool-tabs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { GIT_HISTORY_TAB_VALUE } from "@/features/git/types";
import { useSimulatorCenterTabStore } from "@/features/simulator/store/use-simulator-center-tab";
import { SIMULATOR_TAB_VALUE } from "@/features/simulator/types";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { setCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";

function isTerminalTab(tab: string): boolean {
  return tab === FIXED_TERMINAL_TAB_VALUE || tab.startsWith(TERMINAL_TAB_VALUE_PREFIX);
}

function isEncodedContextTab(tab: string): boolean {
  return (
    tab.startsWith("github-pr:") ||
    tab.startsWith("github-issue:") ||
    tab.startsWith("github-action:") ||
    tab.startsWith("github-commit:") ||
    tab.startsWith("browser:")
  );
}

function isEditorFileTab(tab: string): boolean {
  if (FIXED_TABS.has(tab) || isTerminalTab(tab) || isEncodedContextTab(tab)) {
    return false;
  }
  if (isCenterToolTabValue(tab)) return false;
  return true;
}

export function activateCenterChromeTab(
  contextId: string,
  tab: string,
  opts?: { attach?: boolean; placement?: CenterTabAttachPlacement },
): void {
  if (!contextId || !tab) return;
  setCenterStageLastTab(contextId, tab);
  recordCenterTabActivation(contextId, tab);

  if (tab === "overview") {
    useOverviewCenterTabStore.getState().open(contextId);
  }
  if (isCenterToolTabValue(tab)) {
    useToolCenterTabsStore.getState().open(contextId, tab);
  }
  if (tab === SIMULATOR_TAB_VALUE) {
    useSimulatorCenterTabStore.getState().open(contextId);
  }
  if (tab === GIT_HISTORY_TAB_VALUE) {
    useGitHistoryCenterTabStore.getState().open(contextId);
  }
  if (isTerminalTab(tab)) {
    useTerminalStore.getState().setActiveTerminalTab(contextId, tab);
  }

  const editor = useEditorStore.getState();
  if (isEditorFileTab(tab)) {
    editor.setActiveFile(tab, contextId);
  } else {
    editor.setActiveFile(null, contextId);
  }

  if (opts?.attach !== false) {
    attachCenterTab(contextId, tab, { placement: opts?.placement });
  }
}
