import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import {
  hitPlusMenuControl,
  isPointInRect,
  isPointerOverPlusMenuChrome,
  shouldRetainPlusMenuForOutsidePointer,
  shouldSchedulePlusMenuClose,
  stealPlusMenuClickFromOverlay,
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
});
