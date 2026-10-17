/**
 * Execute-output ANSI matching web `ansi-to-react` (anser JSON, no linkify).
 * Only the last decoration is painted, the same way that component's style switch works.
 */

import Anser from "anser";
import { escapeCarriageReturn } from "escape-carriage";

export type TerminalAnsiStyle = {
  color?: string;
  backgroundColor?: string;
  fontWeight?: "bold";
  fontStyle?: "italic";
  opacity?: number;
  textDecorationLine?: "underline" | "line-through";
};

export type TerminalAnsiPiece = {
  text: string;
  style?: TerminalAnsiStyle;
};

type AnserEntry = {
  content: string;
  fg: string | null;
  bg: string | null;
  decoration: string | null;
};

function fixBackspace(value: string): string {
  let current = value;
  let next = current;
  do {
    current = next;
    next = current.replace(/[^\n]\x08/gm, "");
  } while (next.length < current.length);
  return current;
}

function styleFor(entry: AnserEntry): TerminalAnsiStyle | undefined {
  const style: TerminalAnsiStyle = {};
  if (entry.fg) style.color = `rgb(${entry.fg})`;
  if (entry.bg) style.backgroundColor = `rgb(${entry.bg})`;
  switch (entry.decoration) {
    case "bold":
      style.fontWeight = "bold";
      break;
    case "dim":
      style.opacity = 0.5;
      break;
    case "italic":
      style.fontStyle = "italic";
      break;
    case "hidden":
      style.opacity = 0;
      break;
    case "strikethrough":
      style.textDecorationLine = "line-through";
      break;
    case "underline":
      style.textDecorationLine = "underline";
      break;
    default:
      break;
  }
  return style.color ||
    style.backgroundColor ||
    style.fontWeight ||
    style.fontStyle ||
    style.opacity != null ||
    style.textDecorationLine
    ? style
    : undefined;
}

export function terminalAnsiPieces(input: string): TerminalAnsiPiece[] {
  const prepared = escapeCarriageReturn(fixBackspace(input));
  const entries = Anser.ansiToJson(prepared, {
    json: true,
    remove_empty: true,
  }) as AnserEntry[];
  return entries.map((entry) => {
    const style = styleFor(entry);
    return style ? { text: entry.content, style } : { text: entry.content };
  });
}
