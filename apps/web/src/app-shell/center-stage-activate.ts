/**
 * Live center-tab activation. Paint-context stores are the source of truth;
 * URL `tab` is only a one-shot deep link consumed by CenterStage.
 */

import { attachCenterTab } from "@/app-shell/center-space/center-open-context";
import {
  layoutOwnsTab,
  type CenterTabAttachPlacement,
} from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
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
  agentChatTabActivationOnContext,
  isAgentChatTabValue,
  parseAgentChatTabValue,
  useAgentChatCenterTabsStore,
} from "@/features/agent/store/use-agent-chat-center-tabs";
import {
  type PaneFocusAck,
  useAgentAttentionStore,
} from "@/features/agent/store/agent-attention-store";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { automationWindowNameFromTerminalTabId } from "@/features/terminal/store/terminal-store-helpers";
import { setCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import { tabValueBelongsToPaintContext } from "@/app-shell/center-space/center-space-url";

function isTerminalTab(tab: string): boolean {
  return tab === FIXED_TERMINAL_TAB_VALUE || tab.startsWith(TERMINAL_TAB_VALUE_PREFIX);
}

function isEncodedContextTab(tab: string): boolean {
  return (
    tab.startsWith("github-pr:") ||
    tab.startsWith("github-issue:") ||
    tab.startsWith("github-action:") ||
    tab.startsWith("git-commit:") ||
    tab.startsWith("github-commit:") ||
    tab.startsWith("browser:") ||
    isAgentChatTabValue(tab)
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
  opts?: {
    attach?: boolean;
    placement?: CenterTabAttachPlacement;
    attentionAck?: PaneFocusAck;
    /**
     * Deep links / explicit opens mint a missing surface. Last-tab restore
     * after Close must not recreate a tab the user already dismissed.
     */
    createIfMissing?: boolean;
  },
): void {
  if (!contextId || !tab) return;
  const createIfMissing = opts?.createIfMissing !== false;
  const layout = useCenterPaneLayoutStore.getState().getLayout(contextId);
  const ownedByLayout = Boolean(layout && layoutOwnsTab(layout, tab));

  const chatStore = useAgentChatCenterTabsStore.getState();
  const parsedChatId = parseAgentChatTabValue(tab);
  let resolvedTab = tab;
  let boundChatId: string | null = null;
  if (parsedChatId) {
    const activation = agentChatTabActivationOnContext(
      chatStore.tabsByContext,
      contextId,
      tab,
    );
    if (activation.ignore) return;
    if (!activation.existing && !createIfMissing) return;
    if (parsedChatId.startsWith("draft:")) {
      boundChatId = activation.existing?.chatId?.trim() || null;
    } else {
      const opened =
        activation.existing ??
        chatStore.openTab({ contextId, chatId: parsedChatId });
      if (opened.contextId !== contextId) return;
      resolvedTab = opened.value;
      boundChatId = opened.chatId ?? parsedChatId;
    }
  }

  if (!createIfMissing && !ownedByLayout) {
    if (
      isCenterToolTabValue(resolvedTab) &&
      !useToolCenterTabsStore.getState().isOpen(contextId, resolvedTab)
    ) {
      return;
    }
    if (
      resolvedTab === SIMULATOR_TAB_VALUE &&
      !useSimulatorCenterTabStore.getState().isOpen(contextId)
    ) {
      return;
    }
    if (
      resolvedTab === GIT_HISTORY_TAB_VALUE &&
      !useGitHistoryCenterTabStore.getState().isOpen(contextId)
    ) {
      return;
    }
    if (
      resolvedTab === "overview" &&
      !useOverviewCenterTabStore.getState().isOpen(contextId)
    ) {
      return;
    }
    if (
      isTerminalTab(resolvedTab) &&
      !useTerminalStore
        .getState()
        .getTerminalTabs(contextId)
        .some((item) => item.id === resolvedTab)
    ) {
      return;
    }
  }

  if (
    (resolvedTab.startsWith("github-") ||
      resolvedTab.startsWith("git-commit:") ||
      resolvedTab.startsWith("browser:")) &&
    !tabValueBelongsToPaintContext(resolvedTab, contextId)
  ) {
    return;
  }

  setCenterStageLastTab(contextId, resolvedTab);
  recordCenterTabActivation(contextId, resolvedTab);

  if (resolvedTab === "overview") {
    useOverviewCenterTabStore.getState().open(contextId);
  }
  if (isCenterToolTabValue(resolvedTab)) {
    useToolCenterTabsStore.getState().open(contextId, resolvedTab);
  }
  if (resolvedTab === SIMULATOR_TAB_VALUE) {
    useSimulatorCenterTabStore.getState().open(contextId);
  }
  if (resolvedTab === GIT_HISTORY_TAB_VALUE) {
    useGitHistoryCenterTabStore.getState().open(contextId);
  }
  if (isTerminalTab(resolvedTab)) {
    const terminalStore = useTerminalStore.getState();
    const existingTabs = terminalStore.getTerminalTabs(contextId);
    if (!existingTabs.some((tab) => tab.id === resolvedTab)) {
      const automationWindow = automationWindowNameFromTerminalTabId(resolvedTab);
      if (automationWindow) {
        const ensured = terminalStore.ensureAutomationTerminalTab(contextId, {
          windowName: automationWindow,
        });
        if (ensured) resolvedTab = ensured.id;
      } else if (resolvedTab === FIXED_TERMINAL_TAB_VALUE) {
        const ensured = terminalStore.ensureFixedTerminalTab(contextId);
        resolvedTab = ensured.id;
      } else {
        // Foreign `terminal-tab:{uuid}` — do not mint Term or attach it here.
        return;
      }
    }
    terminalStore.setActiveTerminalTab(contextId, resolvedTab);
  }
  if (boundChatId) {
    useAgentAttentionStore.getState().notifyPaneFocused(`chat:${boundChatId}`, {
      ack: opts?.attentionAck ?? "immediate",
    });
  } else if (parsedChatId) {
    const focused = useAgentAttentionStore.getState().focusedStablePaneId;
    if (focused?.startsWith("chat:")) {
      useAgentAttentionStore.getState().notifyPaneFocused(null);
    }
  }

  const editor = useEditorStore.getState();
  if (isEditorFileTab(resolvedTab)) {
    editor.setActiveFile(resolvedTab, contextId);
  } else {
    editor.setActiveFile(null, contextId);
  }

  if (opts?.attach !== false) {
    attachCenterTab(contextId, resolvedTab, { placement: opts?.placement });
  }
}
