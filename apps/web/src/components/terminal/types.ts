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
  onSessionReady?: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onSessionError?: (sessionId: string, error: string) => void;
  /** Called when tmux window is assigned (for new sessions) */
  onTmuxWindowAssigned?: (sessionId: string, tmuxWindowName: string) => void;
}

export interface TerminalPaneProps {
  id: string;
  title: string;
  sessionId: string;
  workspaceId: string;
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
  | WsTerminalResize
  | WsTerminalClose
  | WsTerminalDestroy;

export interface WsTerminalCreated {
  type: "terminal_created";
  session_id: string;
  workspace_id: string;
}

export interface WsTerminalAttached {
  type: "terminal_attached";
  session_id: string;
  workspace_id: string;
  history?: string;
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
