import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import {
  countOpenLayers,
  isLifecycleOpenLayer,
  summarizeOpenLayers,
} from "../layer-count";

function installDom() {
  const window = new Window({ url: "https://atmos.test/" });
  const { document } = window;
  Object.assign(globalThis, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  return { window, document };
}

describe("isLifecycleOpenLayer / countOpenLayers (B5)", () => {
  let document: Document;

  beforeEach(() => {
    ({ document } = installDom());
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("counts dialog open even when opacity is 0 (fade-in frame)", () => {
    const el = document.createElement("div");
    el.setAttribute("data-slot", "dialog-content");
    el.setAttribute("data-state", "open");
    el.style.opacity = "0";
    el.style.display = "block";
    el.style.visibility = "visible";
    document.body.appendChild(el);

    expect(isLifecycleOpenLayer(el)).toBe(true);
    expect(countOpenLayers([document])).toBe(1);
  });

  it("ignores closed data-state", () => {
    const el = document.createElement("div");
    el.setAttribute("data-slot", "popover-content");
    el.setAttribute("data-state", "closed");
    el.style.opacity = "1";
    document.body.appendChild(el);
    expect(countOpenLayers([document])).toBe(0);
  });

  it("ignores opacity-0 native surface markers (peek shell)", () => {
    const el = document.createElement("div");
    el.setAttribute("data-atmos-native-surface-overlay", "true");
    el.style.opacity = "0";
    el.style.display = "block";
    el.style.visibility = "visible";
    // give a non-zero rect via layout if happy-dom supports
    el.style.width = "100px";
    el.style.height = "100px";
    document.body.appendChild(el);
    expect(isLifecycleOpenLayer(el)).toBe(false);
    expect(countOpenLayers([document])).toBe(0);
  });

  it("counts visible native surface markers", () => {
    const el = document.createElement("div");
    el.setAttribute("data-atmos-native-surface-overlay", "true");
    el.style.opacity = "1";
    el.style.display = "block";
    el.style.visibility = "visible";
    el.style.width = "100px";
    el.style.height = "100px";
    document.body.appendChild(el);
    // happy-dom may report 0 rect without layout — inject getBoundingClientRect
    el.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        toJSON() {
          return this;
        },
      }) as DOMRect;
    expect(isLifecycleOpenLayer(el)).toBe(true);
  });

  it("counts layers from a foreign-realm document (overlay window)", () => {
    // Simulate the overlay BrowserWindow: its nodes are instances of a
    // DIFFERENT realm's HTMLElement — instanceof against the host realm
    // must not be used (that regression made every elevated layer invisible).
    class HostRealmHTMLElement {}
    Object.assign(globalThis, { HTMLElement: HostRealmHTMLElement });

    const foreign = new Window({ url: "https://atmos.test/overlay" });
    const el = foreign.document.createElement("div");
    el.setAttribute("data-slot", "dropdown-menu-content");
    el.setAttribute("data-state", "open");
    foreign.document.body.appendChild(el);

    expect(
      el instanceof (globalThis as unknown as { HTMLElement: typeof HostRealmHTMLElement }).HTMLElement,
    ).toBe(false);
    expect(
      countOpenLayers([foreign.document as unknown as Document]),
    ).toBe(1);
  });
});

describe("summarizeOpenLayers pointer classification", () => {
  let document: Document;

  beforeEach(() => {
    ({ document } = installDom());
  });

  it("tooltip/hover-card–only frames stay pass-through", () => {
    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-slot", "tooltip-content");
    tooltip.setAttribute("data-state", "open");
    document.body.appendChild(tooltip);

    const hoverCard = document.createElement("div");
    hoverCard.setAttribute("data-slot", "hover-card-content");
    hoverCard.setAttribute("data-state", "open");
    document.body.appendChild(hoverCard);

    expect(summarizeOpenLayers([document])).toEqual({ open: 2, capture: 0 });
  });

  it("menus and dialogs require capture", () => {
    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-slot", "tooltip-content");
    tooltip.setAttribute("data-state", "open");
    document.body.appendChild(tooltip);

    const menu = document.createElement("div");
    menu.setAttribute("data-slot", "dropdown-menu-content");
    menu.setAttribute("data-state", "open");
    document.body.appendChild(menu);

    expect(summarizeOpenLayers([document])).toEqual({ open: 2, capture: 1 });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);

    expect(summarizeOpenLayers([document])).toEqual({ open: 3, capture: 2 });
  });
});
