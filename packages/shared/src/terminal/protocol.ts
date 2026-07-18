export type TerminalSize = {
  cols: number;
  rows: number;
};

export type TerminalSnapshot = TerminalSize & {
  data: string;
  cursor_x: number;
  cursor_y: number;
  alternate: boolean;
  /**
   * Re-enable TUI mouse tracking after reattach hydration.
   * Set by the backend when the pane is on the alternate screen, or the
   * foreground is a known inline mouse TUI (e.g. Grok). Not set for arbitrary
   * non-shell processes so wheel scrollback stays usable.
   * Older servers omit this; clients fall back to `alternate`.
   */
  restore_mouse_tracking?: boolean;
};

export type TerminalOpenMessage = {
  type: "terminal_open";
  session_id: string;
  workspace_id: string;
  attach?: boolean;
  tmux_window_name?: string;
  tmux_window_index?: number;
  cwd?: string;
  project_name?: string;
  workspace_name?: string;
  terminal_name?: string;
  cols?: number;
  rows?: number;
};

export type TerminalClientMessage =
  | TerminalOpenMessage
  | { type: "terminal_input"; session_id: string; data: string }
  | { type: "terminal_report"; session_id: string; data: string }
  | { type: "terminal_resize"; session_id: string; cols: number; rows: number }
  | { type: "terminal_close"; session_id: string }
  | { type: "terminal_destroy"; session_id: string };

export type TerminalServerMessage =
  | { type: "terminal_created"; session_id: string; workspace_id: string; snapshot?: TerminalSnapshot | null }
  | { type: "terminal_attached"; session_id: string; workspace_id: string; snapshot?: TerminalSnapshot | null }
  | { type: "terminal_output"; session_id: string; data_b64: string }
  | { type: "terminal_closed"; session_id: string }
  | { type: "terminal_destroyed"; session_id: string }
  | { type: "terminal_error"; session_id?: string; error: string };

export type TerminalRendererEvent =
  | { type: "write_b64"; session_id: string; chunks: string[] }
  | { type: "terminal_error"; session_id?: string; error: string }
  | { type: "terminal_closed"; session_id: string };
