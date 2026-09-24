export type TerminalSelectionHandle = {
  height: number;
  x: number;
  y: number;
};

/** Positions are in the terminal surface's coordinate space. */
export type TerminalSelectionChrome = {
  anchorX: number;
  anchorY: number;
  end: TerminalSelectionHandle | null;
  start: TerminalSelectionHandle | null;
  text: string;
};
