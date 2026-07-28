// Terminal component types

export interface TerminalSession {
  id: string;
  workspaceId: string;
  name: string;
  status: "connecting" | "connected" | "disconnected" | "reconnecting" | "error";
  createdAt: Date;
  /** tmux window name for reconnection (e.g., "1", "2", "3") */
  tmuxWindowName?: string;
}

export interface TerminalMessage {
  type: "input" | "output" | "resize" | "ping" | "pong" | "error";
  sessionId: string;
  data?: string;
  cols?: number;
  rows?: number;
  error?: string;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalProps {
  sessionId: string;
  workspaceId: string;
  className?: string;
  /** tmux window name for reconnection (if set, will try to attach to existing window) */
  tmuxWindowName?: string;
  /** Project name for human-readable tmux session naming */
  projectName?: string;
  /** Workspace name for human-readable tmux session naming */
  workspaceName?: string;
  /** Terminal/window name (e.g., "Claude", "Codex", or auto-incremented number) */
  terminalName?: string;
  /** Side-chat terminals are scoped children of a source terminal pane. */
  terminalKind?: "standard" | "side_chat";
  sideChatId?: string;
  sourcePaneId?: string;
  sourceTmuxWindowName?: string;
  /** 
   * If true, this is a new pane - use terminalName to create a new window.
   * If false/undefined, use tmuxWindowName to attach to existing window.
   */
  isNewPane?: boolean;
  onSessionReady?: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onSessionError?: (sessionId: string, error: string) => void;
  /** Called when tmux window is assigned (for new sessions) */
  onTmuxWindowAssigned?: (sessionId: string, tmuxWindowName: string) => void;
  /** If true, bypasses tmux logic and requests a raw shell session */
  noTmux?: boolean;
  /** Working directory for the terminal session */
  cwd?: string;
  /** Project root path for resolving project-relative file links */
  projectRootPath?: string;
  onData?: (data: string) => void;
  readOnly?: boolean;
  /** Visual scale used when the terminal is rendered in a canvas overlay. */
  terminalScale?: number;
  /** Called when the terminal's dynamic title changes (from shell shim OSC sequences) */
  onTitleChange?: (title: string) => void;
  /**
   * When false, this terminal is off-screen (warm workspace / inactive tab).
   * Skip ResizeObserver + fit so hop does not thrash layout for hidden xterms.
   * Default true for standalone / canvas embeds.
   */
  surfaceActive?: boolean;
  /** Called when the terminal has a non-empty text selection that can become AI context. */
  onSelectionSnapshotChange?: (snapshot: TerminalSelectionSnapshot | null) => void;
  /** Adds the current terminal selection to terminal AI Input context. */
  onAddSelectionAsContext?: (snapshot: TerminalSelectionSnapshot) => void;
  /** Adds the current terminal selection and activates side chat mode. */
  onStartSideChatForSelection?: (snapshot: TerminalSelectionSnapshot) => void;
}

export interface TerminalSelectionSnapshot {
  id: string;
  text: string;
  sourceSessionId?: string | null;
  sourceTmuxWindowName?: string | null;
  selectedAtMs: number;
  lineCount: number;
  byteCount: number;
  truncated: boolean;
  anchor: { x: number; y: number };
}

export interface TerminalPaneAgent {
  id: string;
  label: string;
  command: string;
  iconType: "built-in" | "custom";
  /** For agents that use pipe commands (e.g., echo 'prompt' | amp), this stores the actual agent command after the pipe */
  pipeCommand?: string;
}

export interface TerminalPaneProps {
  id: string;
  /**
   * User-visible display name. Set once at creation (e.g., "Claude Code", "Codex", "1").
   * NEVER overwritten by tmux window name changes after initial creation.
   * Persisted to backend.
   */
  label: string;
  /**
   * tmux window identifier used for session attach/create operations. This is
   * the only pane field that tracks tmux window renames.
   */
  tmuxWindowName?: string;
  /** Code Agent metadata used for toolbar icon rendering. */
  agent?: TerminalPaneAgent;
  sessionId: string;
  workspaceId: string;
  /** Project name for human-readable tmux session naming */
  projectName?: string;
  /** Workspace name for human-readable tmux session naming */
  workspaceName?: string;
  /**
   * If true, this is a newly created pane that doesn't have a tmux window yet.
   * The Terminal will send terminal_name (to create) instead of tmux_window_name (to attach).
   */
  isNewPane?: boolean;
  /**
   * Dynamic title from shell shim (e.g., running command name or current directory).
   * This is transient and NOT persisted to backend — only used for tab display.
   */
  dynamicTitle?: string;
  /**
   * User custom display name. Highest-priority display source for the pane toolbar.
   * Empty/undefined means no override (fall back to auto title logic). Persisted.
   * NEVER used as the tmux window name / uniqueness key — display only.
   */
  customLabel?: string;
  /**
   * When a customLabel is set, also show the detected agent icon + label after it.
   * `undefined` is treated as `true` (default on). Agent wins over CWD. Persisted.
   */
  keepAgentName?: boolean;
  /**
   * When a customLabel is set and no agent suffix is shown, also show the dynamic
   * CWD/command title after it. `undefined` is treated as `true` (default on).
   * Suppressed whenever the agent suffix is shown (mutually exclusive). Persisted.
   */
  keepCwd?: boolean;
}

export interface TerminalMosaicState {
  panes: Record<string, TerminalPaneProps>;
  layout: MosaicNode<string> | null;
}

// react-mosaic types
export type MosaicNode<T> =
  | MosaicBranch<T>
  | T;

export interface MosaicBranch<T> {
  direction: "row" | "column";
  first: MosaicNode<T>;
  second: MosaicNode<T>;
  splitPercentage?: number;
}

export type MosaicDirection = "row" | "column";

// WebSocket message types for terminal communication
export interface WsTerminalCreate {
  type: "terminal_create";
  workspace_id: string;
  shell?: string;
}

export interface WsTerminalAttach {
  type: "terminal_attach";
  workspace_id: string;
  tmux_window_name: string;
}

export interface WsTerminalInput {
  type: "terminal_input";
  session_id: string;
  data: string;
}

export interface WsTerminalEnter {
  type: "terminal_enter";
  session_id: string;
}

export interface WsTerminalReport {
  type: "terminal_report";
  session_id: string;
  data: string;
}

export interface WsTerminalResize {
  type: "terminal_resize";
  session_id: string;
  cols: number;
  rows: number;
}

export interface WsTerminalClose {
  type: "terminal_close";
  session_id: string;
}

export interface WsTerminalDestroy {
  type: "terminal_destroy";
  session_id: string;
}

export type WsTerminalRequest =
  | WsTerminalCreate
  | WsTerminalAttach
  | WsTerminalInput
  | WsTerminalEnter
  | WsTerminalReport
  | WsTerminalResize
  | WsTerminalClose
  | WsTerminalDestroy;

export interface TerminalSnapshot {
  data: string;
  cursor_x: number;
  cursor_y: number;
  cols: number;
  rows: number;
  alternate?: boolean;
  /** Re-enable TUI mouse tracking after reattach (backend-computed). */
  restore_mouse_tracking?: boolean;
  /** Exact DECSET sequence from observed TUI modes (preferred over default). */
  mouse_tracking_sequence?: string | null;
}

export interface WsTerminalCreated {
  type: "terminal_created";
  session_id: string;
  workspace_id: string;
  snapshot?: TerminalSnapshot | null;
}

export interface WsTerminalAttached {
  type: "terminal_attached";
  session_id: string;
  workspace_id: string;
  snapshot?: TerminalSnapshot | null;
}

export interface WsTerminalOutput {
  type: "terminal_output";
  session_id: string;
  data: string;
}

export interface WsTerminalClosed {
  type: "terminal_closed";
  session_id: string;
}

export interface WsTerminalDestroyed {
  type: "terminal_destroyed";
  session_id: string;
}

export interface WsTerminalError {
  type: "terminal_error";
  session_id?: string;
  error: string;
}

export type WsTerminalResponse =
  | WsTerminalCreated
  | WsTerminalAttached
  | WsTerminalOutput
  | WsTerminalClosed
  | WsTerminalDestroyed
  | WsTerminalError;
