/** Default tmux grid when connecting a hidden headless pane (never FitAddon on opacity:0). */
export const HIDDEN_PTY_CONNECT_GRID = { cols: 80, rows: 24 } as const;

export function shouldConnectHiddenPty(args: {
  surfaceActive: boolean;
  connectWhileHidden: boolean;
}): boolean {
  return !args.surfaceActive && args.connectWhileHidden;
}
