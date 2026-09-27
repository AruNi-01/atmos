export type TerminalKeyboardAction = "blur-terminal" | "dismiss" | "focus-terminal";

export type TerminalKeyboardHandler = (action: TerminalKeyboardAction) => void;

export type TerminalInsertHandler = (data: string) => void;
