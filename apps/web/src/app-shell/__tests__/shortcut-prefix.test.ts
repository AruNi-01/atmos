import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import {
  collectSidebarShortcutTargets,
  heldShortcutPrefixFromModifiers,
  isCenterStageHotkeyTarget,
  modifiersFromKeyboardEvent,
  parseSidebarShortcutTarget,
  serializeSidebarShortcutTarget,
  sidebarShortcutDigitsFromTargets,
  SIDEBAR_SHORTCUT_SCOPE_ATTR,
  SIDEBAR_SHORTCUT_TARGET_ATTR,
} from "@/app-shell/shortcut-prefix";

describe("sidebar shortcut targets", () => {
  let previousDocument: PropertyDescriptor | undefined;
  let previousWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const win = new Window();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: win.document,
      writable: true,
    });
  });

  afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  test("parses and serializes project/workspace keys", () => {
    expect(parseSidebarShortcutTarget("workspace:abc")).toEqual({
      kind: "workspace",
      id: "abc",
    });
    expect(parseSidebarShortcutTarget("project:p1")).toEqual({
      kind: "project",
      id: "p1",
    });
    expect(parseSidebarShortcutTarget("group:g1")).toBeNull();
    expect(serializeSidebarShortcutTarget({ kind: "project", id: "p1" })).toBe(
      "project:p1",
    );
  });

  test("numbers visible items in the secondary column, skipping groups", () => {
    document.body.innerHTML = `
      <div ${SIDEBAR_SHORTCUT_SCOPE_ATTR}="list">
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="project:ignored-left"></div>
      </div>
      <div ${SIDEBAR_SHORTCUT_SCOPE_ATTR}="secondary">
        <div>Today</div>
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="workspace:w1"></div>
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="project:p1"></div>
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="workspace:w2"></div>
      </div>
    `;
    for (const el of document.querySelectorAll(`[${SIDEBAR_SHORTCUT_TARGET_ATTR}]`)) {
      (el as HTMLElement).checkVisibility = () => true;
    }
    const targets = collectSidebarShortcutTargets(document);
    expect(targets).toEqual([
      { kind: "workspace", id: "w1" },
      { kind: "project", id: "p1" },
      { kind: "workspace", id: "w2" },
    ]);
    expect(sidebarShortcutDigitsFromTargets(targets)).toEqual({
      "workspace:w1": 1,
      "project:p1": 2,
      "workspace:w2": 3,
    });
  });

  test("one-column list uses list scope and skips hidden rows", () => {
    document.body.innerHTML = `
      <div ${SIDEBAR_SHORTCUT_SCOPE_ATTR}="list">
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="workspace:pinned"></div>
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="project:hidden"></div>
        <div ${SIDEBAR_SHORTCUT_TARGET_ATTR}="workspace:visible"></div>
      </div>
    `;
    const nodes = [...document.querySelectorAll(`[${SIDEBAR_SHORTCUT_TARGET_ATTR}]`)];
    (nodes[0] as HTMLElement).checkVisibility = () => true;
    (nodes[1] as HTMLElement).checkVisibility = () => false;
    (nodes[2] as HTMLElement).checkVisibility = () => true;
    expect(collectSidebarShortcutTargets(document)).toEqual([
      { kind: "workspace", id: "pinned" },
      { kind: "workspace", id: "visible" },
    ]);
  });
});

describe("center hotkey scope", () => {
  let previousDocument: PropertyDescriptor | undefined;
  let previousWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const win = new Window();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: win.document,
      writable: true,
    });
  });

  afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  test("only matches center stage chrome", () => {
    document.body.innerHTML = `
      <aside id="sidebar"><input id="side" /></aside>
      <div data-center-stage-card=""><textarea id="term"></textarea></div>
    `;
    expect(isCenterStageHotkeyTarget(document.getElementById("term"))).toBe(true);
    expect(isCenterStageHotkeyTarget(document.getElementById("side"))).toBe(false);
  });
});

describe("held shortcut prefix", () => {
  test("cmd is tab prefix, cmd+shift is sidebar prefix, and both require center focus", () => {
    expect(
      heldShortcutPrefixFromModifiers({ mod: true, shift: false, centerFocused: true }),
    ).toBe("mod");
    expect(
      heldShortcutPrefixFromModifiers({ mod: true, shift: true, centerFocused: true }),
    ).toBe("mod-shift");
    expect(
      heldShortcutPrefixFromModifiers({ mod: true, shift: true, centerFocused: false }),
    ).toBeNull();
  });

  test("keyup on meta clears the modifier even if metaKey is still true", () => {
    const event = {
      type: "keyup",
      key: "Meta",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
    } as KeyboardEvent;
    expect(modifiersFromKeyboardEvent(event)).toEqual({ mod: false, shift: false });
  });
});

describe("shortcut prefix wiring", () => {
  test("sidebar maps cmd+shift+1-9 from the visible list, two-column uses the second pane", () => {
    const sidebar = readFileSync(join(import.meta.dir, "../LeftSidebar.tsx"), "utf8");
    const controls = readFileSync(
      join(import.meta.dir, "../left-sidebar-controls.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("SIDEBAR_STRIP_POSITION_HOTKEYS");
    expect(sidebar).toContain("collectSidebarShortcutTargets");
    expect(sidebar).toContain('data-sidebar-shortcut-scope": "list"');
    expect(controls).toContain('data-sidebar-shortcut-scope="secondary"');
    const shell = readFileSync(join(import.meta.dir, "../AppShellMain.tsx"), "utf8");
    expect(shell).toContain("HeldShortcutPrefixListener");
  });
});

