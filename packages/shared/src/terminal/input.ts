export type TerminalShortcut =
  | { id: string; label: string; sequence: string; kind: "sequence" }
  | { id: string; label: string; insertText: string; submit?: boolean; kind: "text" }
  | {
      id: string;
      label: string;
      action: "new-terminal" | "paste" | "switch-terminal" | "workspace-list";
      kind: "action";
    };

export const terminalShortcuts: TerminalShortcut[] = [
  { id: "esc", label: "Esc", sequence: "\u001b", kind: "sequence" },
  { id: "tab", label: "Tab", sequence: "\t", kind: "sequence" },
  { id: "up", label: "↑", sequence: "\u001b[A", kind: "sequence" },
  { id: "down", label: "↓", sequence: "\u001b[B", kind: "sequence" },
  { id: "left", label: "←", sequence: "\u001b[D", kind: "sequence" },
  { id: "right", label: "→", sequence: "\u001b[C", kind: "sequence" },
  { id: "ctrl-c", label: "⌃C", sequence: "\u0003", kind: "sequence" },
  { id: "ctrl-d", label: "⌃D", sequence: "\u0004", kind: "sequence" },
  { id: "ctrl-l", label: "⌃L", sequence: "\u000c", kind: "sequence" },
  { id: "ctrl-a", label: "⌃A", sequence: "\u0001", kind: "sequence" },
  { id: "ctrl-e", label: "⌃E", sequence: "\u0005", kind: "sequence" },
  { id: "agent-continue", label: "Continue", insertText: "continue", submit: true, kind: "text" },
  { id: "agent-yes", label: "Yes", insertText: "yes", submit: true, kind: "text" },
  { id: "agent-no", label: "No", insertText: "no", submit: true, kind: "text" },
  { id: "paste", label: "Paste", action: "paste", kind: "action" },
  { id: "new-terminal", label: "New", action: "new-terminal", kind: "action" },
  { id: "switch-terminal", label: "Switch", action: "switch-terminal", kind: "action" },
  { id: "workspace-list", label: "List", action: "workspace-list", kind: "action" },
];

export function wrapBracketedPaste(text: string): string {
  const normalised = text.replace(/\r?\n/g, "\r");
  return `\x1b[200~${normalised}\x1b[201~`;
}

export function isTerminalEmulatorReport(data: string): boolean {
  if (!data.startsWith("\x1b")) return false;

  if (data.startsWith("\x1b]")) return true;
  if (/^\x1b\[\??[\d;]*c$/.test(data)) return true;
  if (/^\x1b\[\d+;\d+R$/.test(data)) return true;
  if (/^\x1b\[\?[\d;]+;\d+\$y$/.test(data)) return true;
  if (/^\x1b\[\d+(?:;\d+)*t$/.test(data)) return true;

  return false;
}
