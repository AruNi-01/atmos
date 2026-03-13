import { getAgentPromptQueueKey } from "@/hooks/use-dialog-store";
import type { AgentChatMode } from "@/types/agent-chat";

type DraftUpdater = string | ((previous: string) => string);

type ActiveComposerHandle = {
  setDraft: (updater: DraftUpdater) => void;
};

const activeComposers = new Map<string, ActiveComposerHandle>();

function escapeSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function queryAgentTextarea(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  mode: AgentChatMode,
): HTMLTextAreaElement | null {
  if (typeof document === "undefined") return null;

  const modeSelector = `[data-agent-chat-mode="${escapeSelectorValue(mode)}"]`;
  const selectors: string[] = [];

  if (workspaceId) {
    selectors.push(
      `textarea[data-agent-chat-input="true"]${modeSelector}[data-agent-chat-workspace-id="${escapeSelectorValue(workspaceId)}"]`,
    );
  }
  if (projectId) {
    selectors.push(
      `textarea[data-agent-chat-input="true"]${modeSelector}[data-agent-chat-project-id="${escapeSelectorValue(projectId)}"]`,
    );
  }
  selectors.push(`textarea[data-agent-chat-input="true"]${modeSelector}`);

  for (const selector of selectors) {
    const element = document.querySelector<HTMLTextAreaElement>(selector);
    if (element) return element;
  }

  return null;
}

function appendTextToTextarea(textarea: HTMLTextAreaElement, text: string) {
  const current = textarea.value.trim();
  const nextValue = current ? `${current}\n\n${text}` : text;
  const prototype = Object.getPrototypeOf(textarea) as HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(textarea, nextValue);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

export function registerActiveAgentComposer(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  mode: AgentChatMode,
  handle: ActiveComposerHandle,
) {
  const key = getAgentPromptQueueKey(workspaceId, projectId, mode);
  activeComposers.set(key, handle);

  return () => {
    if (activeComposers.get(key) === handle) {
      activeComposers.delete(key);
    }
  };
}

export function writeToActiveAgentComposer(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined,
  mode: AgentChatMode,
  text: string,
): boolean {
  const textarea = queryAgentTextarea(workspaceId, projectId, mode);
  if (textarea) {
    appendTextToTextarea(textarea, text);
    return true;
  }

  const key = getAgentPromptQueueKey(workspaceId, projectId, mode);
  const composer = activeComposers.get(key);
  if (!composer) return false;

  composer.setDraft((previous) => {
    const current = previous.trim();
    return current ? `${current}\n\n${text}` : text;
  });
  return true;
}
