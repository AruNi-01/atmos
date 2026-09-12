function normalizeProjectRoot(root: string): string {
  return root.replace(/[\\/]+$/, "");
}

let active: { projectRoot: string; windowName: string; panelActive: boolean } | null = null;

/** Remember the inner Run tab while the Run panel is visible. */
export function setRunLogPanelWindow(input: {
  projectRoot: string;
  windowName: string;
  panelActive: boolean;
}): void {
  const projectRoot = normalizeProjectRoot(input.projectRoot.trim());
  const windowName = input.windowName.trim();
  if (!projectRoot || !windowName) return;

  if (input.panelActive) {
    active = { projectRoot, windowName, panelActive: true };
    return;
  }

  if (active?.projectRoot === projectRoot && active.windowName === windowName) {
    active = { ...active, panelActive: false };
  }
}

export function getPreferredRunLogWindow(projectRoot?: string | null): string | undefined {
  const root = normalizeProjectRoot(projectRoot?.trim() ?? "");
  if (!root || !active?.panelActive || active.projectRoot !== root) return undefined;
  return active.windowName;
}

export function resetRunLogPanelWindowForTests(): void {
  active = null;
}
