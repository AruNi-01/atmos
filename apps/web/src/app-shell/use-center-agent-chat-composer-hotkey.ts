"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { getFocusedPane } from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import {
  resolveCenterAgentChatHotkeyAction,
  scheduleFocusVisibleCenterAgentChatComposer,
} from "@/app-shell/center-agent-chat-hotkey";
import {
  CENTER_REGION_DIGIT_HOTKEY_OPTIONS,
  consumeCenterRegionDigitEvent,
  isCenterStageHotkeyTarget,
} from "@/app-shell/shortcut-prefix";

export function useCenterAgentChatComposerHotkey({
  contextId,
  onCreateAgentChat,
  onActivateTab,
}: {
  contextId: string | null | undefined;
  onCreateAgentChat: () => string | null | undefined;
  onActivateTab: (tabId: string) => void;
}) {
  useHotkeys(
    "mod+l",
    (event) => {
      if (event.shiftKey || event.altKey) return;
      if (!isCenterStageHotkeyTarget(event.target)) return;
      if (!contextId) return;
      consumeCenterRegionDigitEvent(event);
      const layout = useCenterPaneLayoutStore.getState().getLayout(contextId);
      const pane = layout ? getFocusedPane(layout) : null;
      const next = resolveCenterAgentChatHotkeyAction(pane);
      if (next.action === "create") {
        const tabId = onCreateAgentChat();
        scheduleFocusVisibleCenterAgentChatComposer(tabId);
        return;
      }
      if (next.action === "activate") {
        onActivateTab(next.tabId);
      }
      scheduleFocusVisibleCenterAgentChatComposer(next.tabId);
    },
    CENTER_REGION_DIGIT_HOTKEY_OPTIONS,
    [contextId, onActivateTab, onCreateAgentChat],
  );
}
