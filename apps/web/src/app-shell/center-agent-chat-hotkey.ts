import { isAgentChatTabValue } from "@/features/agent/store/use-agent-chat-center-tabs";

export type CenterAgentChatHotkeyAction =
  | { action: "focus"; tabId: string }
  | { action: "activate"; tabId: string }
  | { action: "create" };

export function resolveCenterAgentChatHotkeyAction(pane: {
  tabIds: readonly string[];
  activeTabId: string;
} | null | undefined): CenterAgentChatHotkeyAction {
  if (!pane) return { action: "create" };
  if (isAgentChatTabValue(pane.activeTabId)) {
    return { action: "focus", tabId: pane.activeTabId };
  }
  const existing = [...pane.tabIds].reverse().find((tabId) => isAgentChatTabValue(tabId));
  if (existing) return { action: "activate", tabId: existing };
  return { action: "create" };
}

function composerEditorSelector(tabId?: string | null): string {
  const tab = tabId?.trim()
    ? `[data-agent-chat-tab="${CSS.escape(tabId)}"]`
    : "[data-agent-chat-tab]";
  return `${tab}:not([aria-hidden="true"]) [data-agent-chat-composer] [contenteditable="true"]`;
}

export function focusVisibleCenterAgentChatComposer(tabId?: string | null): boolean {
  if (typeof document === "undefined") return false;
  const editor = document.querySelector<HTMLElement>(composerEditorSelector(tabId));
  if (!editor) return false;
  editor.focus({ preventScroll: true });
  return document.activeElement === editor;
}

export function scheduleFocusVisibleCenterAgentChatComposer(
  tabId?: string | null,
  attempts = 12,
): void {
  if (typeof window === "undefined") return;
  const tryFocus = (left: number) => {
    if (focusVisibleCenterAgentChatComposer(tabId) || left <= 0) return;
    window.requestAnimationFrame(() => tryFocus(left - 1));
  };
  tryFocus(attempts);
}
