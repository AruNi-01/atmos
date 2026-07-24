import {
  extractCommandName,
  getTerminalDisplayMeta,
  isPathLikeTitle,
  type ContestedOwnersMap,
  type TerminalTitleAgent,
} from "@atmos/shared/terminal";

export type CloseConfirmPaneNameInput = {
  label?: string;
  customLabel?: string;
  dynamicTitle?: string;
  agent?: {
    id: string;
    label: string;
    command: string;
    iconType?: string;
    pipeCommand?: string;
    aliases?: string[];
  };
};

function basenameCommand(value: string): string {
  const extracted = extractCommandName(value);
  return extracted.split(/[\\/]/).filter(Boolean).pop() ?? extracted;
}

/**
 * Human-friendly label for a pane in close-confirm dialogs.
 * Prefer recognized agent names over raw shell/binary command titles.
 */
export function getTerminalCloseConfirmName(
  pane: CloseConfirmPaneNameInput,
  configuredAgents: TerminalTitleAgent[] = [],
  contestedOwners?: ContestedOwnersMap,
): string {
  const custom = pane.customLabel?.trim();
  const meta = getTerminalDisplayMeta({
    baseTitle: custom || pane.label,
    dynamicTitle: pane.dynamicTitle,
    configuredAgents,
    agent: pane.agent,
    contestedOwners,
  });

  if (meta.toolbarAgent?.label) {
    const agentLabel = meta.toolbarAgent.label;
    if (custom && custom.toLowerCase() !== agentLabel.toLowerCase()) {
      return `${custom} · ${agentLabel}`;
    }
    return agentLabel;
  }

  // Pane may still carry a pinned agent even when dynamic title is an ugly binary.
  const storedAgentLabel = pane.agent?.label?.trim();
  if (storedAgentLabel) {
    if (custom && custom.toLowerCase() !== storedAgentLabel.toLowerCase()) {
      return `${custom} · ${storedAgentLabel}`;
    }
    return storedAgentLabel;
  }

  if (custom) return custom;

  const dynamic = pane.dynamicTitle?.trim();
  if (dynamic) {
    // Pure cwd-style paths are not useful "running" names; keep pane label.
    // Absolute executable paths (esp. under bin/) or commands with args still
    // shorten to a basename so we never dump a long binary path into the modal.
    const looksLikeExecutablePath =
      /(?:^|[\\/])(?:s?bin)[\\/]/i.test(dynamic.replace(/\\/g, "/")) ||
      /\s/.test(dynamic);
    if (!isPathLikeTitle(dynamic) || looksLikeExecutablePath) {
      return basenameCommand(dynamic);
    }
  }

  return pane.label?.trim() || meta.displayTitle?.trim() || "Terminal";
}
