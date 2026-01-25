// Terminal component types

export interface TerminalSession {
  id: string;
  workspaceId: string;
  name: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  createdAt: Date;
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
  onSessionReady?: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onSessionError?: (sessionId: string, error: string) => void;
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

export type WsTerminalRequest =
  | WsTerminalCreate
  | WsTerminalInput
  | WsTerminalResize
  | WsTerminalClose;

export interface WsTerminalCreated {
  type: "terminal_created";
  session_id: string;
  workspace_id: string;
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

export interface WsTerminalError {
  type: "terminal_error";
  session_id?: string;
  error: string;
}

export type WsTerminalResponse =
  | WsTerminalCreated
  | WsTerminalOutput
  | WsTerminalClosed
  | WsTerminalError;
