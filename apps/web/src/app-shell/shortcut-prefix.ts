export const SIDEBAR_SHORTCUT_LIMIT = 9;

export const SIDEBAR_STRIP_POSITION_HOTKEYS =
  "mod+shift+1,mod+shift+2,mod+shift+3,mod+shift+4,mod+shift+5,mod+shift+6,mod+shift+7,mod+shift+8,mod+shift+9";

export const SIDEBAR_SHORTCUT_TARGET_ATTR = "data-sidebar-shortcut-target";
export const SIDEBAR_SHORTCUT_SCOPE_ATTR = "data-sidebar-shortcut-scope";

/** Desktop shell IPC event: native tap / guest webview forwarded digit chords. */
export const HOST_DIGIT_SHORTCUT_EVENT = "host-shortcut";

export type HeldShortcutPrefix = "mod" | "mod-shift" | null;

export type SidebarShortcutTarget =
  | { kind: "workspace"; id: string }
  | { kind: "project"; id: string };

export type HostDigitShortcutPayload = {
  digit: number;
  shift: boolean;
};

export type CenterDigitShortcutHandler = (digit: number) => boolean;

/** Capture so editors / contenteditable cannot swallow ⌘1–9 before the shell. */
export const CENTER_REGION_DIGIT_HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  eventListenerOptions: { capture: true },
} as const;

const CENTER_HOTKEY_SCOPE_SELECTOR = [
  "[data-app-shell-center-column]",
  "[data-center-stage-card]",
  "[data-center-stage-body]",
  "[data-center-stage-fullscreen-slot]",
  "[data-center-panel-host]",
  "[data-center-pane-owner]",
  "[data-atmos-browser-surface]",
  "[data-atmos-browser-surface-overlay]",
  ".terminal-grid-container",
].join(",");

let centerRegionPointerActive = false;
let centerStripShortcutHandler: CenterDigitShortcutHandler | null = null;
let sidebarStripShortcutHandler: CenterDigitShortcutHandler | null = null;
let lastDispatchKey = "";
let lastDispatchAt = 0;

export function serializeSidebarShortcutTarget(
  target: SidebarShortcutTarget,
): string {
  return `${target.kind}:${target.id}`;
}

export function parseSidebarShortcutTarget(
  value: string | null | undefined,
): SidebarShortcutTarget | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (kind === "workspace" || kind === "project") return { kind, id };
  return null;
}

function asElement(value: EventTarget | { parentElement?: Element | null } | null | undefined): Element | null {
  if (!value || typeof value !== "object") return null;
  if ("closest" in value && typeof (value as Element).closest === "function") {
    return value as Element;
  }
  const parent = "parentElement" in value ? (value as { parentElement?: Element | null }).parentElement : null;
  return parent ?? null;
}

function isDocumentRoot(element: Element): boolean {
  return element === document.body || element === document.documentElement;
}

export function elementIsInCenterHotkeyScope(
  target: EventTarget | { parentElement?: Element | null } | null | undefined,
): boolean {
  const element = asElement(target);
  if (!element || isDocumentRoot(element)) return false;
  return Boolean(element.closest(CENTER_HOTKEY_SCOPE_SELECTOR));
}

/**
 * Last pointer-down in the center column keeps Cmd/Cmd+Shift+1–9 armed even
 * when the click landed on a non-focusable panel (activeElement becomes body).
 * Terminal auto-focuses a textarea, so it worked without this; Files / Overview
 * / GitHub / editor chrome often do not.
 */
export function noteCenterRegionPointerTarget(
  target: EventTarget | null | undefined,
): void {
  centerRegionPointerActive = elementIsInCenterHotkeyScope(target);
}

export function noteCenterRegionFocusTarget(
  target: EventTarget | null | undefined,
): void {
  const element = asElement(target);
  if (!element || isDocumentRoot(element)) return;
  centerRegionPointerActive = elementIsInCenterHotkeyScope(element);
}

export function resetCenterRegionPointerActiveForTests(): void {
  centerRegionPointerActive = false;
  lastDispatchKey = "";
  lastDispatchAt = 0;
}

export function isCenterStageHotkeyTarget(target: EventTarget | null | undefined): boolean {
  if (elementIsInCenterHotkeyScope(target)) return true;
  if (typeof document !== "undefined" && elementIsInCenterHotkeyScope(document.activeElement)) {
    return true;
  }
  return centerRegionPointerActive;
}

export function consumeCenterRegionDigitEvent(event: {
  preventDefault: () => void;
  stopPropagation: () => void;
  stopImmediatePropagation: () => void;
}): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function registerCenterStripShortcutHandler(
  handler: CenterDigitShortcutHandler | null,
): void {
  centerStripShortcutHandler = handler;
}

export function registerSidebarStripShortcutHandler(
  handler: CenterDigitShortcutHandler | null,
): void {
  sidebarStripShortcutHandler = handler;
}

export function parseHostDigitShortcutPayload(
  payload: unknown,
): HostDigitShortcutPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const digit = (payload as { digit?: unknown }).digit;
  const shift = (payload as { shift?: unknown }).shift;
  if (typeof digit !== "number" || !Number.isInteger(digit) || digit < 0 || digit > 9) {
    return null;
  }
  return { digit, shift: Boolean(shift) };
}

export function dispatchCenterRegionDigitShortcut(input: {
  digit: number;
  shift: boolean;
}): boolean {
  if (!isCenterStageHotkeyTarget(null)) return false;
  const dispatchKey = `${input.shift ? "s" : "n"}:${input.digit}`;
  const now = Date.now();
  if (dispatchKey === lastDispatchKey && now - lastDispatchAt < 80) return true;
  const handled = input.shift
    ? (sidebarStripShortcutHandler?.(input.digit) ?? false)
    : (centerStripShortcutHandler?.(input.digit) ?? false);
  if (!handled) return false;
  lastDispatchKey = dispatchKey;
  lastDispatchAt = now;
  return true;
}

export function heldShortcutPrefixFromModifiers(input: {
  mod: boolean;
  shift: boolean;
  centerFocused: boolean;
}): HeldShortcutPrefix {
  if (!input.centerFocused || !input.mod) return null;
  return input.shift ? "mod-shift" : "mod";
}

export function modifiersFromKeyboardEvent(event: KeyboardEvent): {
  mod: boolean;
  shift: boolean;
} {
  const key = event.key;
  const isKeyup = event.type === "keyup";
  const modKey = key === "Meta" || key === "Control";
  const shiftKey = key === "Shift";
  return {
    mod: isKeyup && modKey ? false : event.metaKey || event.ctrlKey,
    shift: isKeyup && shiftKey ? false : event.shiftKey,
  };
}

export function isShortcutHintElementVisible(el: Element): boolean {
  if (typeof (el as HTMLElement).checkVisibility === "function") {
    return (el as HTMLElement).checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
    });
  }
  return true;
}

export function collectSidebarShortcutTargets(
  root: ParentNode = document,
): SidebarShortcutTarget[] {
  const scoped =
    root.querySelector(`[${SIDEBAR_SHORTCUT_SCOPE_ATTR}="secondary"]`) ??
    root.querySelector(`[${SIDEBAR_SHORTCUT_SCOPE_ATTR}="list"]`) ??
    root;
  const nodes = scoped.querySelectorAll(`[${SIDEBAR_SHORTCUT_TARGET_ATTR}]`);
  const targets: SidebarShortcutTarget[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (!isShortcutHintElementVisible(node)) continue;
    const parsed = parseSidebarShortcutTarget(
      node.getAttribute(SIDEBAR_SHORTCUT_TARGET_ATTR),
    );
    if (!parsed) continue;
    const key = serializeSidebarShortcutTarget(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(parsed);
    if (targets.length >= SIDEBAR_SHORTCUT_LIMIT) break;
  }
  return targets;
}

export function sidebarShortcutDigitsFromTargets(
  targets: readonly SidebarShortcutTarget[],
): Record<string, number> {
  const digits: Record<string, number> = {};
  for (let index = 0; index < targets.length && index < SIDEBAR_SHORTCUT_LIMIT; index += 1) {
    const target = targets[index];
    if (!target) continue;
    digits[serializeSidebarShortcutTarget(target)] = index + 1;
  }
  return digits;
}

export function shortcutModGlyph(): string {
  if (typeof navigator === "undefined") return "⌘";
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘" : "Ctrl";
}
