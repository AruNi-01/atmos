import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import {
  engageCenterSpaceLayoutShield,
  layoutClientRect,
  releaseCenterSpaceLayoutShield,
} from "@/app-shell/center-space/center-space-layout-shield";

describe("center space layout shield", () => {
  it("divides the posed scale out of a descendant box", () => {
    expect(
      layoutClientRect({
        rootLayout: { left: 100, top: 50, width: 1000, height: 800 },
        rootVisual: { left: 400, top: 200, width: 250, height: 200 },
        visual: { left: 450, top: 240, width: 25, height: 20 },
      }),
    ).toEqual({ left: 300, top: 210, width: 100, height: 80 });
  });

  it("keeps a translation from moving the layout box", () => {
    expect(
      layoutClientRect({
        rootLayout: { left: 100, top: 50, width: 1000, height: 800 },
        rootVisual: { left: 400, top: 200, width: 1000, height: 800 },
        visual: { left: 450, top: 240, width: 100, height: 80 },
      }),
    ).toEqual({ left: 150, top: 90, width: 100, height: 80 });
  });

  it("returns the visual box when the scale cannot be inverted", () => {
    const visual = { left: 10, top: 12, width: 0, height: 8 };
    expect(
      layoutClientRect({
        rootLayout: { left: 0, top: 0, width: 1000, height: 800 },
        rootVisual: { left: 0, top: 0, width: 0, height: 0 },
        visual,
      }),
    ).toEqual(visual);
  });

  it("reports the full center box for a page inside the scaled preview", () => {
    const win = new Window();
    const previous = {
      window: globalThis.window,
      document: globalThis.document,
      Element: globalThis.Element,
      HTMLElement: globalThis.HTMLElement,
      DOMRect: globalThis.DOMRect,
      Node: globalThis.Node,
      ShadowRoot: globalThis.ShadowRoot,
      Range: globalThis.Range,
      getComputedStyle: globalThis.getComputedStyle,
    };
    const nativeRect = win.Element.prototype.getBoundingClientRect;
    const nativeRects = win.Element.prototype.getClientRects;
    const nativeRangeRect = win.Range.prototype.getBoundingClientRect;
    const nativeRangeRects = win.Range.prototype.getClientRects;
    const assign = (key: string, value: unknown) => {
      Object.assign(globalThis, { [key]: value });
    };
    try {
      assign("window", win);
      assign("document", win.document);
      assign("Element", win.Element);
      assign("HTMLElement", win.HTMLElement);
      assign("DOMRect", win.DOMRect);
      assign("Node", win.Node);
      assign("ShadowRoot", win.ShadowRoot);
      assign("Range", win.Range);
      assign("getComputedStyle", win.getComputedStyle.bind(win));

      const stage = win.document.createElement("div");
      const root = win.document.createElement("div");
      const child = win.document.createElement("div");
      const outside = win.document.createElement("div");
      const host = win.document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      const inner = win.document.createElement("span");
      shadow.append(inner);
      win.document.body.append(stage, outside);
      stage.append(root);
      root.append(child, host);

      const pin = (
        el: HTMLElement,
        box: { w: number; h: number; l: number; t: number; parent: HTMLElement | null },
      ) => {
        Object.defineProperty(el, "offsetWidth", { configurable: true, get: () => box.w });
        Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => box.h });
        Object.defineProperty(el, "offsetLeft", { configurable: true, get: () => box.l });
        Object.defineProperty(el, "offsetTop", { configurable: true, get: () => box.t });
        Object.defineProperty(el, "offsetParent", { configurable: true, get: () => box.parent });
      };
      pin(win.document.body, { w: 1400, h: 900, l: 0, t: 0, parent: null });
      pin(stage, { w: 1000, h: 800, l: 0, t: 0, parent: win.document.body });
      pin(root, { w: 1000, h: 800, l: 0, t: 0, parent: stage });
      pin(child, { w: 100, h: 80, l: 200, t: 160, parent: root });

      const stubRect = function getBoundingClientRect(this: Element) {
        return visuals.get(this) ?? nativeRect.call(this);
      };
      const visuals = new Map<Element, DOMRect>([
        [stage, new win.DOMRect(100, 50, 1000, 800)],
        [win.document.body, new win.DOMRect(0, 0, 1400, 900)],
        [root, new win.DOMRect(400, 200, 250, 200)],
        [child, new win.DOMRect(450, 240, 25, 20)],
        [outside, new win.DOMRect(12, 14, 40, 20)],
        [inner, new win.DOMRect(460, 250, 10, 8)],
      ]);
      const listFor = (rect: DOMRect) =>
        ({
          length: 1,
          0: rect,
          item: (index: number) => (index === 0 ? rect : null),
          *[Symbol.iterator]() {
            yield rect;
          },
        }) as unknown as DOMRectList;
      win.Element.prototype.getBoundingClientRect = stubRect;
      win.Element.prototype.getClientRects = function getClientRects() {
        const rect = visuals.get(this);
        return rect ? listFor(rect) : nativeRects.call(this);
      };

      engageCenterSpaceLayoutShield();
      root.setAttribute("data-center-space-posed", "");

      expect(win.document.documentElement.getAttribute("data-center-space-layout-shield")).toBe("");
      expect(child.getBoundingClientRect()).toMatchObject({
        left: 300,
        top: 210,
        width: 100,
        height: 80,
      });
      expect(root.getBoundingClientRect()).toMatchObject({
        left: 100,
        top: 50,
        width: 1000,
        height: 800,
      });
      expect(outside.getBoundingClientRect()).toMatchObject({
        left: 12,
        top: 14,
        width: 40,
        height: 20,
      });
      expect(child.getClientRects()[0]).toMatchObject({ width: 100, height: 80 });
      expect(inner.getBoundingClientRect()).toMatchObject({
        left: 340,
        top: 250,
        width: 40,
        height: 32,
      });

      root.removeAttribute("data-center-space-posed");
      releaseCenterSpaceLayoutShield();
      expect(win.document.documentElement.hasAttribute("data-center-space-layout-shield")).toBe(
        false,
      );
      expect(child.getBoundingClientRect()).toMatchObject({
        left: 450,
        top: 240,
        width: 25,
        height: 20,
      });
      expect(win.Element.prototype.getBoundingClientRect).toBe(stubRect);
    } finally {
      releaseCenterSpaceLayoutShield();
      win.Element.prototype.getBoundingClientRect = nativeRect;
      win.Element.prototype.getClientRects = nativeRects;
      win.Range.prototype.getBoundingClientRect = nativeRangeRect;
      win.Range.prototype.getClientRects = nativeRangeRects;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete (globalThis as Record<string, unknown>)[key];
        } else {
          assign(key, value);
        }
      }
      win.happyDOM.close();
    }
  });
});
