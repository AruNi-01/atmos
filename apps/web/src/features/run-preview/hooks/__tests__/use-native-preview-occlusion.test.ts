import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { readNativePreviewOcclusionSnapshot } from "../use-native-preview-occlusion";

function installDom() {
  const window = new Window({ url: "https://atmos.test/" });
  const { document } = window;

  Object.assign(globalThis, {
    window,
    document,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    getComputedStyle: window.getComputedStyle.bind(window),
  });

  return { window, document };
}

function setRect(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  element.getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right,
      bottom,
      toJSON() {
        return this;
      },
    }) as DOMRect;
}

describe("readNativePreviewOcclusionSnapshot", () => {
  let document: Document;

  beforeEach(() => {
    ({ document } = installDom());
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("treats visible data-atmos-native-surface-overlay as occluding when it intersects", () => {
    const surface = document.createElement("div");
    setRect(surface, { left: 200, top: 80, width: 600, height: 400 });
    document.body.appendChild(surface);

    // Collapsed right-sidebar peek / maximized browser portal style overlay.
    const overlay = document.createElement("div");
    overlay.setAttribute("data-atmos-native-surface-overlay", "true");
    overlay.style.opacity = "1";
    setRect(overlay, { left: 640, top: 48, width: 360, height: 700 });
    document.body.appendChild(overlay);

    const snapshot = readNativePreviewOcclusionSnapshot(surface, null);
    expect(snapshot.isOccluded).toBe(true);
    expect(snapshot.candidates).toContain(overlay);
  });

  it("ignores opt-in overlays that are fully transparent", () => {
    const surface = document.createElement("div");
    setRect(surface, { left: 200, top: 80, width: 600, height: 400 });
    document.body.appendChild(surface);

    const overlay = document.createElement("div");
    overlay.setAttribute("data-atmos-native-surface-overlay", "true");
    overlay.style.opacity = "0";
    setRect(overlay, { left: 640, top: 48, width: 360, height: 700 });
    document.body.appendChild(overlay);

    const snapshot = readNativePreviewOcclusionSnapshot(surface, null);
    expect(snapshot.isOccluded).toBe(false);
    expect(snapshot.candidates).toHaveLength(0);
  });

  it("does not treat an overlay that contains the surface as occluding (self fullscreen)", () => {
    const portal = document.createElement("div");
    portal.setAttribute("data-atmos-native-surface-overlay", "true");
    portal.style.opacity = "1";
    setRect(portal, { left: 0, top: 0, width: 1200, height: 800 });
    document.body.appendChild(portal);

    const surface = document.createElement("div");
    setRect(surface, { left: 0, top: 40, width: 1200, height: 760 });
    portal.appendChild(surface);

    const snapshot = readNativePreviewOcclusionSnapshot(surface, portal);
    expect(snapshot.isOccluded).toBe(false);
  });
});
