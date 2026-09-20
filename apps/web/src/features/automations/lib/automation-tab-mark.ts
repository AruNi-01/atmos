import {
  automationTabTooltip,
  automationTerminalWindowName,
} from "@/features/automations/lib/automation-run-landing";
import type { AutomationRunSummary } from "@/features/automations/types";

export type AutomationTabMarkPane = {
  sessionId?: string | null;
  tmuxWindowName?: string | null;
  origin?: string | null;
  runGuid?: string | null;
};

export type AutomationTabMarkSurface =
  | {
      kind: "terminal";
      panes: readonly AutomationTabMarkPane[];
    }
  | {
      kind: "chat";
      chatId?: string | null;
      source?: string | null;
      automationRunGuid?: string | null;
    };

export type AutomationTabMarkMatch = {
  run: AutomationRunSummary;
  tooltip: string;
};

function jobName(run: AutomationRunSummary): string {
  return run.terminal_display_name?.trim() || run.automation_guid;
}

function paneMatchesRun(
  pane: AutomationTabMarkPane,
  run: AutomationRunSummary,
): boolean {
  const paneRunGuid = pane.runGuid?.trim();
  if (paneRunGuid) {
    return paneRunGuid === run.guid;
  }
  const sessionId = pane.sessionId?.trim();
  if (sessionId && sessionId === run.surface_session_id?.trim()) {
    return true;
  }
  const windowName = pane.tmuxWindowName?.trim();
  if (windowName && windowName === automationTerminalWindowName(run.guid)) {
    return true;
  }
  if (windowName && run.tmux_window_name && windowName === run.tmux_window_name) {
    return true;
  }
  return false;
}

function chatMatchesRun(
  surface: Extract<AutomationTabMarkSurface, { kind: "chat" }>,
  run: AutomationRunSummary,
): boolean {
  const runGuid = surface.automationRunGuid?.trim();
  if (runGuid) {
    return runGuid === run.guid;
  }
  const chatId = surface.chatId?.trim();
  if (chatId && chatId === run.surface_session_id?.trim()) {
    return true;
  }
  return false;
}

export function resolveAutomationTabMark(
  surface: AutomationTabMarkSurface,
  runs: readonly AutomationRunSummary[],
): AutomationTabMarkMatch | null {
  for (const run of runs) {
    if (surface.kind === "terminal") {
      if (surface.panes.some((pane) => paneMatchesRun(pane, run))) {
        return { run, tooltip: automationTabTooltip(jobName(run), run.guid) };
      }
      continue;
    }
    if (chatMatchesRun(surface, run)) {
      return { run, tooltip: automationTabTooltip(jobName(run), run.guid) };
    }
  }
  return null;
}
