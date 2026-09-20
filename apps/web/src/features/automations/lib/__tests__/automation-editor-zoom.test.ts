import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import {
  applyRelativeEditorBox,
  automationEditorZoomTransition,
  boxRelativeTo,
  boxRelativeToClip,
  fillVisibleClipBox,
  queryAutomationEditorExpandTarget,
  rectToEditorBox,
  releaseOverflowAlongPath,
  zoomLookTransform,
  zoomTransformCss,
} from "../automation-editor-zoom";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const previousGetComputedStyle = Object.getOwnPropertyDescriptor(
  globalThis,
  "getComputedStyle",
);

beforeEach(() => {
  const win = new Window({ url: "https://app.atmos.local/" });
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
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: win.getComputedStyle.bind(win),
    writable: true,
  });
});

afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document");
  if (previousGetComputedStyle) {
    Object.defineProperty(globalThis, "getComputedStyle", previousGetComputedStyle);
  } else {
    Reflect.deleteProperty(globalThis, "getComputedStyle");
  }
});

describe("automation editor zoom geometry", () => {
  test("look transform scales a small origin onto a large layout", () => {
    const origin = { top: 100, left: 50, width: 100, height: 50 };
    const layout = { top: 20, left: 10, width: 400, height: 200 };
    expect(zoomLookTransform(origin, layout)).toEqual({
      x: 40,
      y: 80,
      scaleX: 0.25,
      scaleY: 0.25,
    });
    expect(zoomTransformCss(origin, layout)).toBe(
      "translate(40px, 80px) scale(0.25, 0.25)",
    );
    expect(automationEditorZoomTransition()).toContain("width");
    expect(automationEditorZoomTransition()).toContain("border-color");
    expect(automationEditorZoomTransition()).not.toContain("transform ");
  });

  test("applies a clip-relative pixel box so borders stay 1px", () => {
    document.body.innerHTML = `<div id="el"></div>`;
    const el = document.getElementById("el")!;
    applyRelativeEditorBox(el, { top: 10, left: 20, width: 300, height: 200 });
    expect(el.style.position).toBe("absolute");
    expect(el.style.top).toBe("10px");
    expect(el.style.left).toBe("20px");
    expect(el.style.width).toBe("300px");
    expect(el.style.height).toBe("200px");
    expect(el.style.boxSizing).toBe("border-box");
  });

  test("clip-relative boxes include the clip scroll offset", () => {
    document.body.innerHTML = `<div id="clip" style="position:relative;width:400px;height:200px"></div>`;
    const clip = document.getElementById("clip")!;
    Object.defineProperty(clip, "scrollTop", { configurable: true, value: 80 });
    Object.defineProperty(clip, "scrollLeft", { configurable: true, value: 12 });
    const viewport = { top: 50, left: 20, width: 100, height: 40 };
    const origin = rectToEditorBox(clip.getBoundingClientRect());
    const relative = boxRelativeTo(viewport, origin);
    expect(boxRelativeToClip(viewport, clip)).toEqual({
      top: relative.top + 80,
      left: relative.left + 12,
      width: 100,
      height: 40,
    });
    expect(fillVisibleClipBox(clip)).toEqual({
      top: 80,
      left: 12,
      width: origin.width,
      height: origin.height,
    });
  });

  test("converts a viewport box into a transformed containing block", () => {
    expect(
      boxRelativeTo(
        { top: 65, left: 308, width: 1590, height: 960 },
        { top: 49, left: 292 },
      ),
    ).toEqual({
      top: 16,
      left: 16,
      width: 1590,
      height: 960,
    });
  });

  test("expands into the center-stage card clip, not the overlay or body", () => {
    document.body.innerHTML = `
      <div data-center-stage-body id="body">
        <div data-center-stage-card id="workspace-card"></div>
        <div data-launchpad-center-overlay id="overlay">
          <div data-center-stage-card id="launchpad-card">
            <div data-center-stage-card-clip id="clip">
              <div data-automation-editor-expand-host id="host"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    expect(queryAutomationEditorExpandTarget(document.getElementById("host"))?.id).toBe(
      "clip",
    );
  });

  test("falls back to the center-stage card when there is no clip node", () => {
    document.body.innerHTML = `
      <div data-center-stage-body id="body">
        <div data-center-stage-card id="card">
          <div data-automation-editor-expand-host id="host"></div>
        </div>
      </div>
    `;
    expect(queryAutomationEditorExpandTarget(document.getElementById("host"))?.id).toBe(
      "card",
    );
  });

  test("releases overflow along the path and restores it", () => {
    document.body.innerHTML = `
      <div id="outer" style="overflow: hidden">
        <div id="inner" style="overflow: auto">
          <div id="leaf"></div>
        </div>
      </div>
    `;
    const outer = document.getElementById("outer")!;
    const inner = document.getElementById("inner")!;
    const leaf = document.getElementById("leaf")!;
    const restore = releaseOverflowAlongPath(leaf, outer);
    expect(inner.style.overflow).toBe("visible");
    expect(outer.style.overflow).toBe("visible");
    restore();
    expect(inner.style.overflow).toBe("auto");
    expect(outer.style.overflow).toBe("hidden");
  });
});
