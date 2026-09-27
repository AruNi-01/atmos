export type TerminalModifierState = {
  command: boolean;
  ctrl: boolean;
  option: boolean;
  shift: boolean;
};

export const NO_TERMINAL_MODIFIERS: TerminalModifierState = {
  command: false,
  ctrl: false,
  option: false,
  shift: false,
};

export type TerminalKeyResult = { type: "action"; action: "copy" | "paste" } | { type: "input"; data: string };

const SHIFTED_DIGIT: Record<string, string> = {
  "0": ")",
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
};

type SpecialKey = {
  arrow?: string;
  codePoint?: number;
  plain: string;
  tilde?: string;
};

const SPECIAL_KEYS: Record<string, SpecialKey> = {
  backspace: { codePoint: 127, plain: "\u007f" },
  delete: { plain: "\u001b[3~", tilde: "3" },
  down: { arrow: "B", plain: "\u001b[B" },
  end: { arrow: "F", plain: "\u001b[F" },
  enter: { codePoint: 13, plain: "\r" },
  esc: { codePoint: 27, plain: "\u001b" },
  f1: { plain: "\u001bOP" },
  f2: { plain: "\u001bOQ" },
  f3: { plain: "\u001bOR" },
  f4: { plain: "\u001bOS" },
  f5: { plain: "\u001b[15~" },
  f6: { plain: "\u001b[17~" },
  f7: { plain: "\u001b[18~" },
  f8: { plain: "\u001b[19~" },
  f9: { plain: "\u001b[20~" },
  f10: { plain: "\u001b[21~" },
  f11: { plain: "\u001b[23~" },
  f12: { plain: "\u001b[24~" },
  home: { arrow: "H", plain: "\u001b[H" },
  insert: { plain: "\u001b[2~", tilde: "2" },
  left: { arrow: "D", plain: "\u001b[D" },
  pagedown: { plain: "\u001b[6~", tilde: "6" },
  pageup: { plain: "\u001b[5~", tilde: "5" },
  pause: { plain: "\u001b[P" },
  prtsc: { plain: "\u001b[i" },
  right: { arrow: "C", plain: "\u001b[C" },
  "scroll-lock": { plain: "\u001b[28~" },
  space: { codePoint: 32, plain: " " },
  tab: { codePoint: 9, plain: "\t" },
  up: { arrow: "A", plain: "\u001b[A" },
};

function modifierValue(mods: TerminalModifierState): number {
  return 1 + (mods.shift ? 1 : 0) + (mods.option ? 2 : 0) + (mods.ctrl ? 4 : 0) + (mods.command ? 8 : 0);
}

function csiU(codePoint: number, mods: TerminalModifierState): string {
  return `\u001b[${codePoint};${modifierValue(mods)}u`;
}

function withCaps(key: string, mods: TerminalModifierState, caps: boolean): TerminalModifierState {
  if (!caps || !/^[a-z]$/.test(key) || mods.ctrl || mods.option || mods.command) return mods;
  return { ...mods, shift: !mods.shift };
}

function input(data: string): TerminalKeyResult {
  return { type: "input", data };
}

export function encodeTerminalKey(
  key: string,
  modifiers: TerminalModifierState,
  caps = false,
): TerminalKeyResult | null {
  const mods = withCaps(key, modifiers, caps);
  const modified = mods.shift || mods.ctrl || mods.option || mods.command;

  if (/^[a-z]$/.test(key)) {
    if (mods.command && !mods.ctrl && !mods.option && !mods.shift) {
      if (key === "c") return { type: "action", action: "copy" };
      if (key === "v") return { type: "action", action: "paste" };
      if (key === "z") return input("\u001f");
    }
    if (mods.ctrl && !mods.option && !mods.command && !mods.shift) {
      return input(String.fromCharCode(key.charCodeAt(0) & 0x1f));
    }
    if (!mods.ctrl && !mods.option && !mods.command) {
      return input(mods.shift ? key.toUpperCase() : key);
    }
    if (mods.option && !mods.ctrl && !mods.command) {
      return input(`\u001b${mods.shift ? key.toUpperCase() : key}`);
    }
    const char = mods.shift ? key.toUpperCase() : key;
    return input(csiU(char.codePointAt(0) ?? key.charCodeAt(0), mods));
  }

  if (key.length === 1) {
    const shifted = mods.shift ? (SHIFTED_DIGIT[key] ?? key) : key;
    if (!mods.ctrl && !mods.option && !mods.command) return input(shifted);
    if (key === " " && mods.ctrl && !mods.option && !mods.command && !mods.shift) return input("\u0000");
    if (mods.option && !mods.ctrl && !mods.command) return input(`\u001b${shifted}`);
    const codePoint = shifted.codePointAt(0);
    if (codePoint === undefined) return null;
    return input(csiU(codePoint, mods));
  }

  const special = SPECIAL_KEYS[key];
  if (!special) return null;
  if (key === "enter" && mods.shift && !mods.ctrl && !mods.option && !mods.command) return input("\u001b[13;2u");
  if (key === "tab" && mods.shift && !mods.ctrl && !mods.option && !mods.command) return input("\u001b[Z");
  if (key === "backspace" && mods.ctrl && !mods.option && !mods.command && !mods.shift) return input("\u0017");
  if (key === "space" && mods.ctrl && !mods.option && !mods.command && !mods.shift) return input("\u0000");
  if (!modified) return input(special.plain);
  if (special.arrow) return input(`\u001b[1;${modifierValue(mods)}${special.arrow}`);
  if (special.tilde) return input(`\u001b[${special.tilde};${modifierValue(mods)}~`);
  if (special.codePoint !== undefined && (mods.ctrl || mods.command || mods.option)) {
    return input(csiU(special.codePoint, mods));
  }
  return input(special.plain);
}
