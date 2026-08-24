export const SIDEBAR_SHORTCUT_LIMIT = 9;

export const SIDEBAR_STRIP_POSITION_HOTKEYS =
  "mod+shift+1,mod+shift+2,mod+shift+3,mod+shift+4,mod+shift+5,mod+shift+6,mod+shift+7,mod+shift+8,mod+shift+9";

export const SIDEBAR_SHORTCUT_TARGET_ATTR = "data-sidebar-shortcut-target";
export const SIDEBAR_SHORTCUT_SCOPE_ATTR = "data-sidebar-shortcut-scope";

export type HeldShortcutPrefix = "mod" | "mod-shift" | null;

export type SidebarShortcutTarget =
  | { kind: "workspace"; id: string }
  | { kind: "project"; id: string };

const CENTER_HOTKEY_SCOPE_SELECTOR = [
  "[data-center-stage-card]",
  "[data-center-stage-body]",
  "[data-center-stage-fullscreen-slot]",
  ".terminal-grid-container",
].join(",");

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

export function isCenterStageHotkeyTarget(target: EventTarget | null | undefined): boolean {
  const candidates = [
    target,
    typeof document !== "undefined" ? document.activeElement : null,
  ];
  return candidates.some((node) => {
    const element = asElement(node);
    return Boolean(element?.closest(CENTER_HOTKEY_SCOPE_SELECTOR));
  });
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
