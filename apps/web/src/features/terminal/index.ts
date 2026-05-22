// Terminal component exports
export { Terminal } from "./components/Terminal";
export type { TerminalRef } from "./components/Terminal";
export { TerminalGrid } from "./components/TerminalGrid";
export { useTerminalWebSocket } from "./hooks/use-terminal-websocket";
export { atmosDarkTheme, atmosLightTheme, defaultTerminalOptions, terminalFont } from "./lib/theme";
export type {
  TerminalSession,
  TerminalMessage,
  TerminalSize,
  TerminalProps,
  TerminalPaneProps,
  TerminalMosaicState,
  MosaicNode,
  MosaicBranch,
  MosaicDirection,
  WsTerminalRequest,
  WsTerminalResponse,
  WsTerminalCreate,
  WsTerminalInput,
  WsTerminalResize,
  WsTerminalClose,
  WsTerminalCreated,
  WsTerminalOutput,
  WsTerminalClosed,
  WsTerminalError,
} from "./types/index";
