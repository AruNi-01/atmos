import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import {
  clearPlusMenuHover,
  hitPlusMenuControl,
  isCenterStagePlusMenuEventTarget,
  isPointInRect,
  isPointerOverPlusMenuChrome,
  markCenterStagePlusMenuOpen,
  muteCenterOverlayHits,
  PLUS_MENU_HOT_ATTR,
  resetPlusMenuOpenCountForTests,
  shouldRetainPlusMenuForOutsidePointer,
  shouldSchedulePlusMenuClose,
  stealPlusMenuClickFromOverlay,
  syncPlusMenuHover,
} from "@/app-shell/center-stage-plus-menu-pointer";

function stubBox(
  el: Element,
  box: { left: number; top: number; width: number; height: number },
) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("center stage plus-menu pointer", () => {
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
    resetPlusMenuOpenCountForTests();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  it("treats points inside a rect, including hover slop", () => {
    const rect = { left: 10, right: 20, top: 10, bottom: 20 };
    expect(isPointInRect(10, 10, rect)).toBe(true);
    expect(isPointInRect(20, 20, rect)).toBe(true);
    expect(isPointInRect(9, 10, rect)).toBe(false);
    expect(isPointInRect(9, 10, rect, 1)).toBe(true);
  });

  it("keeps the menu open when a canvas click is still over the popover box", () => {
    document.body.innerHTML = `
      <div data-center-stage-plus-menu>
        <button type="button" id="create-terminal">Terminal</button>
        <div aria-hidden="true">
          <button type="button" id="hidden-layout">Layout</button>
        </div>
      </div>
      <canvas id="xterm"></canvas>
    `;
    const menu = document.querySelector("[data-center-stage-plus-menu]")!;
    const terminal = document.getElementById("create-terminal")!;
    const hidden = document.getElementById("hidden-layout")!;
    const canvas = document.getElementById("xterm")!;
    stubBox(menu, { left: 100, top: 40, width: 192, height: 280 });
    stubBox(terminal, { left: 104, top: 80, width: 184, height: 32 });
    stubBox(hidden, { left: 104, top: 80, width: 184, height: 32 });
    stubBox(canvas, { left: 0, top: 72, width: 800, height: 400 });

    expect(isPointerOverPlusMenuChrome(120, 90)).toBe(true);
    expect(hitPlusMenuControl(120, 90)?.id).toBe("create-terminal");
    expect(
      shouldRetainPlusMenuForOutsidePointer({
        target: canvas,
        clientX: 120,
        clientY: 90,
      }),
    ).toBe(true);
    expect(
      shouldRetainPlusMenuForOutsidePointer({
        target: canvas,
        detail: { originalEvent: { clientX: 120, clientY: 90 } },
      }),
    ).toBe(true);
    expect(
      shouldRetainPlusMenuForOutsidePointer({
        target: canvas,
        detail: { originalEvent: { type: "focusin" } },
      }),
    ).toBe(false);
    expect(
      shouldSchedulePlusMenuClose({
        clientX: 120,
        clientY: 90,
        relatedTarget: canvas,
      }),
    ).toBe(false);
  });

  it("retargets an overlay pointerdown onto the visible plus-menu button", () => {
    document.body.innerHTML = `
      <div data-center-stage-plus-menu>
        <button type="button" id="create-terminal">Terminal</button>
      </div>
      <canvas id="xterm"></canvas>
    `;
    const menu = document.querySelector("[data-center-stage-plus-menu]")!;
    const terminal = document.getElementById("create-terminal")!;
    const canvas = document.getElementById("xterm")!;
    stubBox(menu, { left: 100, top: 40, width: 192, height: 280 });
    stubBox(terminal, { left: 104, top: 80, width: 184, height: 32 });

    let clicked = 0;
    terminal.addEventListener("click", () => {
      clicked += 1;
    });

    const event = {
      button: 0,
      clientX: 120,
      clientY: 90,
      target: canvas,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {},
    };

    const stolen = stealPlusMenuClickFromOverlay(event as unknown as PointerEvent);
    expect(stolen).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(clicked).toBe(1);
  });

  it("does not steal clicks that miss the plus menu", () => {
    document.body.innerHTML = `
      <div data-center-stage-plus-menu>
        <button type="button" id="create-terminal">Terminal</button>
      </div>
      <canvas id="xterm"></canvas>
    `;
    const menu = document.querySelector("[data-center-stage-plus-menu]")!;
    const terminal = document.getElementById("create-terminal")!;
    const canvas = document.getElementById("xterm")!;
    stubBox(menu, { left: 100, top: 40, width: 192, height: 280 });
    stubBox(terminal, { left: 104, top: 80, width: 184, height: 32 });

    let clicked = 0;
    terminal.addEventListener("click", () => {
      clicked += 1;
    });

    const event = {
      button: 0,
      clientX: 20,
      clientY: 400,
      target: canvas,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {},
    };

    expect(stealPlusMenuClickFromOverlay(event as unknown as PointerEvent)).toBe(false);
    expect(clicked).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("skips inactive plus-menu layer buttons that overlap the visible items", () => {
    document.body.innerHTML = `
      <div data-center-stage-plus-menu>
        <div data-plus-menu-layer="active">
          <button type="button" id="create-terminal">Terminal</button>
        </div>
        <div data-plus-menu-layer="inactive">
          <button type="button" id="split-right">Split right</button>
        </div>
      </div>
    `;
    const menu = document.querySelector("[data-center-stage-plus-menu]")!;
    const terminal = document.getElementById("create-terminal")!;
    const split = document.getElementById("split-right")!;
    stubBox(menu, { left: 100, top: 40, width: 192, height: 280 });
    stubBox(terminal, { left: 104, top: 80, width: 184, height: 32 });
    stubBox(split, { left: 104, top: 80, width: 184, height: 32 });

    expect(hitPlusMenuControl(120, 90)?.id).toBe("create-terminal");
    expect(isCenterStagePlusMenuEventTarget(split)).toBe(false);
    expect(isCenterStagePlusMenuEventTarget(terminal)).toBe(true);

    let clicked = 0;
    terminal.addEventListener("click", () => {
      clicked += 1;
    });
    const event = {
      button: 0,
      clientX: 120,
      clientY: 90,
      target: split,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {},
    };
    expect(stealPlusMenuClickFromOverlay(event as unknown as PointerEvent)).toBe(true);
    expect(clicked).toBe(1);
  });

  it("paints hover on the control under an overlay pointer", () => {
    document.body.innerHTML = `
      <div data-center-stage-plus-menu>
        <button type="button" id="create-terminal">Terminal</button>
        <button type="button" id="create-browser">Browser</button>
      </div>
    `;
    const menu = document.querySelector("[data-center-stage-plus-menu]")!;
    const terminal = document.getElementById("create-terminal")!;
    const browser = document.getElementById("create-browser")!;
    stubBox(menu, { left: 100, top: 40, width: 192, height: 280 });
    stubBox(terminal, { left: 104, top: 80, width: 184, height: 32 });
    stubBox(browser, { left: 104, top: 120, width: 184, height: 32 });

    expect(syncPlusMenuHover(120, 90)?.id).toBe("create-terminal");
    expect(terminal.getAttribute(PLUS_MENU_HOT_ATTR)).toBe("");
    expect(browser.hasAttribute(PLUS_MENU_HOT_ATTR)).toBe(false);

    expect(syncPlusMenuHover(120, 130)?.id).toBe("create-browser");
    expect(terminal.hasAttribute(PLUS_MENU_HOT_ATTR)).toBe(false);
    expect(browser.getAttribute(PLUS_MENU_HOT_ATTR)).toBe("");

    clearPlusMenuHover();
    expect(browser.hasAttribute(PLUS_MENU_HOT_ATTR)).toBe(false);
  });

  it("mutes overlay canvases so the plus menu can receive hover", () => {
    document.body.innerHTML = `<canvas id="xterm"></canvas>`;
    const canvas = document.getElementById("xterm") as HTMLElement;
    const unmute = muteCenterOverlayHits();
    expect(canvas.style.getPropertyValue("pointer-events")).toBe("none");
    expect(canvas.style.getPropertyPriority("pointer-events")).toBe("important");
    unmute();
    expect(canvas.style.getPropertyValue("pointer-events")).toBe("");
  });

  it("keeps the html mute flag while any plus menu is still open", () => {
    markCenterStagePlusMenuOpen(true);
    markCenterStagePlusMenuOpen(true);
    expect(document.documentElement.hasAttribute("data-center-stage-plus-menu-open")).toBe(true);
    markCenterStagePlusMenuOpen(false);
    expect(document.documentElement.hasAttribute("data-center-stage-plus-menu-open")).toBe(true);
    markCenterStagePlusMenuOpen(false);
    expect(document.documentElement.hasAttribute("data-center-stage-plus-menu-open")).toBe(false);
  });
});
