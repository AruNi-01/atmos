import { wrapBracketedPaste } from "@/features/terminal/terminal-shortcuts";

/** Text from the glass composer, submitted to the terminal as one payload. */
export function terminalComposerInput(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  if (/[\r\n]/.test(value)) return `${wrapBracketedPaste(value)}\r`;
  return `${value}\r`;
}
