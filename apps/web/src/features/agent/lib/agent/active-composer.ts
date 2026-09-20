import { getAgentPromptQueueKey } from "@/app-shell/state/use-dialog-store";
import type { AgentChatMode } from "@/features/agent/types/index";
import type { AiContextKind } from "@/shared/lib/ai-context-protocol";
import type { TerminalSelectionSnapshot } from "@/features/terminal/types";

type DraftUpdater = string | ((previous: string) => string);

type ActiveComposerHandle = {
  setDraft: (updater: DraftUpdater) => void;
  insertAiContext?: (kind: AiContextKind, promptText: string) => void;
  focus?: () => void;
};

const activeComposers = new Map<string, ActiveComposerHandle>();
let lastFocusedKey: string | null = null;

export function registerActiveAgentComposer(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  mode: AgentChatMode,
  handle: ActiveComposerHandle,
  instanceKey?: string | null,
) {
  const key = getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey);
  activeComposers.set(key, handle);
  if (!lastFocusedKey) lastFocusedKey = key;

  return () => {
    if (activeComposers.get(key) === handle) {
      activeComposers.delete(key);
    }
    if (lastFocusedKey === key) {
      lastFocusedKey = activeComposers.keys().next().value ?? null;
    }
  };
}

export function touchActiveAgentComposer(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  mode: AgentChatMode,
  instanceKey?: string | null,
) {
  const key = getAgentPromptQueueKey(workspaceId, projectId, mode, instanceKey);
  if (activeComposers.has(key)) lastFocusedKey = key;
}

export function writeToActiveAgentComposer(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  mode: AgentChatMode,
  text: string,
): boolean {
  const key = getAgentPromptQueueKey(workspaceId, projectId, mode);
  const composer = activeComposers.get(key) ?? (lastFocusedKey ? activeComposers.get(lastFocusedKey) : undefined);
  if (!composer) return false;

  composer.setDraft((previous) => {
    const current = previous.trim();
    return current ? `${current}\n\n${text}` : text;
  });
  composer.focus?.();
  return true;
}

export function insertTerminalSelectionIntoActiveAgentChat(
  snapshot: TerminalSelectionSnapshot,
): boolean {
  const tryHandle = (handle: ActiveComposerHandle | undefined) => {
    if (!handle?.insertAiContext) return false;
    handle.focus?.();
    handle.insertAiContext("terminal-selection", snapshot.text);
    return true;
  };

  if (lastFocusedKey && tryHandle(activeComposers.get(lastFocusedKey))) {
    return true;
  }
  for (const handle of activeComposers.values()) {
    if (tryHandle(handle)) return true;
  }
  return false;
}

export function addTerminalSelectionAsContext(
  snapshot: TerminalSelectionSnapshot,
  overlay?: { addTerminalSelectionContext: (snapshot: TerminalSelectionSnapshot) => void } | null,
): boolean {
  if (insertTerminalSelectionIntoActiveAgentChat(snapshot)) return true;
  if (!overlay) return false;
  overlay.addTerminalSelectionContext(snapshot);
  return true;
}
