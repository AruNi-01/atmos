// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      menu: "Image actions",
      draw: "Draw",
      undo: "Undo",
      redo: "Redo",
      saveAnnotation: "Save to input",
      saveAnnotationFailedTitle: "Save failed",
      saveAnnotationUnavailable: "Could not save the annotated image.",
      zoomOut: "Zoom out",
      zoomIn: "Zoom in",
      copyImage: "Copy image",
      downloadImage: "Download",
      close: "Close",
      saveImage: "Save image",
      copyFailedTitle: "Copy failed",
      saveFailedTitle: "Save failed",
      clipboardUnavailable: "Could not copy the image to the clipboard.",
      saveUnavailable: "Could not save the image to this computer.",
    })[key] ?? key,
}));

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
  toastManager: {
    add: () => undefined,
  },
  usePromptInputAttachments: () => ({
    files: [],
    add: () => undefined,
    remove: () => undefined,
    clear: () => undefined,
    openFileDialog: () => undefined,
    fileInputRef: { current: null },
  }),
}));

const {
  ImagePreviewOverlay,
  imagePreviewScaledRadius,
  imagePreviewTargetRect,
  imagePreviewZoomTransform,
} = await import("../image-preview-overlay");

const PNG_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let root: Root | null = null;

describe("image preview zoom geometry", () => {
  it("fits the enlarged image in the viewport and zooms from the origin center", () => {
    const origin = {
      left: 100,
      top: 200,
      width: 80,
      height: 80,
      radius: 12,
      naturalWidth: 1024,
      naturalHeight: 1024,
    };
    const target = imagePreviewTargetRect(origin, { width: 1000, height: 800 });
    expect(target.width).toBeLessThanOrEqual(920);
    expect(target.height).toBeLessThanOrEqual(736);
    expect(target.top).toBeGreaterThanOrEqual(40);
    expect(target.width).toBeCloseTo(target.height);
    const zoom = imagePreviewZoomTransform(origin, target);
    expect(zoom.scale).toBeCloseTo(origin.width / target.width);
    expect(zoom.x).toBeCloseTo(origin.left + origin.width / 2 - (target.left + target.width / 2));
    expect(zoom.y).toBeCloseTo(origin.top + origin.height / 2 - (target.top + target.height / 2));
    expect(imagePreviewScaledRadius(12, zoom.scale) * zoom.scale).toBeCloseTo(12);
  });
});

describe("ImagePreviewOverlay context menu", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(async () => {
    if (root) {
      const currentRoot = root;
      root = null;
      await act(async () => {
        currentRoot.unmount();
      });
    }
    cleanupDom();
  });

  it("opens a copy-image menu on right-click without closing", async () => {
    const onClose = mock(() => undefined);
    renderOverlay(onClose);

    const overlay = document.querySelector("[data-image-preview-overlay]");
    expect(overlay).not.toBeNull();
    expect(document.querySelector("[data-image-preview-context-menu]")).toBeNull();

    await act(async () => {
      overlay?.dispatchEvent(
        new window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 40,
        }),
      );
    });

    const menu = document.querySelector("[data-image-preview-context-menu]");
    expect(menu).not.toBeNull();
    expect(menu?.querySelector("[data-image-preview-copy]")).not.toBeNull();
    expect(menu?.textContent).toMatch(/Copy image|copyImage/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("suppresses the native browser context menu", async () => {
    renderOverlay(() => undefined);
    const overlay = document.querySelector("[data-image-preview-overlay]");
    const event = new window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 16,
      clientY: 16,
    });

    await act(async () => {
      overlay?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector("[data-image-preview-context-menu]")).not.toBeNull();
  });

  it("does not close the overlay when dismissing the menu with a click", async () => {
    const onClose = mock(() => undefined);
    renderOverlay(onClose);

    const overlay = document.querySelector("[data-image-preview-overlay]");
    await act(async () => {
      overlay?.dispatchEvent(
        new window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 40,
        }),
      );
    });
    expect(document.querySelector("[data-image-preview-context-menu]")).not.toBeNull();

    await act(async () => {
      overlay?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(document.querySelector("[data-image-preview-context-menu]")).toBeNull();
    expect(document.querySelector("[data-image-preview-overlay]")).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the overlay open after choosing copy image", async () => {
    const onClose = mock(() => undefined);
    renderOverlay(onClose);

    const overlay = document.querySelector("[data-image-preview-overlay]");
    await act(async () => {
      overlay?.dispatchEvent(
        new window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 24,
          clientY: 24,
        }),
      );
    });

    const item = document.querySelector("[data-image-preview-copy]");
    await act(async () => {
      item?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(document.querySelector("[data-image-preview-overlay]")).not.toBeNull();
    expect(document.querySelector("[data-image-preview-context-menu]")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes on a left click when the menu is not open", async () => {
    const onClose = mock(() => undefined);
    renderOverlay(onClose);

    const overlay = document.querySelector("[data-image-preview-overlay]");
    await act(async () => {
      overlay?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders an outside pill toolbar with zoom, copy, download, and close", async () => {
    renderOverlay(() => undefined);

    const toolbar = document.querySelector("[data-image-preview-toolbar]");
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).toContain("absolute");
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="zoom-out"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="zoom-in"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="copy"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="download"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="close"]')).not.toBeNull();
    expect(toolbar?.querySelectorAll("button")).toHaveLength(5);
  });

  it("does not close when clicking the image frame", async () => {
    const onClose = mock(() => undefined);
    renderOverlay(onClose);

    const frame = document.querySelector("[data-image-preview-frame]");
    await act(async () => {
      frame?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector("[data-image-preview-overlay]")).not.toBeNull();
  });

  it("closes from the toolbar close button", async () => {
    const onClose = mock(() => undefined);
    renderOverlay(onClose);

    const close = document.querySelector('[data-image-preview-toolbar-action="close"]');
    await act(async () => {
      close?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides draw tools unless annotation save is enabled", async () => {
    renderOverlay(() => undefined);
    expect(document.querySelector('[data-image-preview-toolbar-action="draw"]')).toBeNull();
  });

  it("shows draw, undo, redo, and save on the composer annotation toolbar", async () => {
    renderOverlay(() => undefined, { onSaveAnnotation: () => undefined });
    const draw = document.querySelector('[data-image-preview-toolbar-action="draw"]');
    expect(draw).not.toBeNull();
    expect(document.querySelector('[data-image-preview-toolbar-action="save-annotation"]')).toBeNull();

    await act(async () => {
      draw?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(document.querySelector('[data-image-preview-toolbar-action="save-annotation"]')).not.toBeNull();
    expect(document.querySelector('[data-image-preview-toolbar-action="undo"]')).not.toBeNull();
    expect(document.querySelector('[data-image-preview-toolbar-action="redo"]')).not.toBeNull();
    const actions = [
      ...document.querySelectorAll("[data-image-preview-toolbar-action]"),
    ].map((node) => node.getAttribute("data-image-preview-toolbar-action"));
    expect(actions.slice(0, 4)).toEqual(["save-annotation", "undo", "redo", "draw"]);
  });

  it("keeps the frame size fixed and scales only the image", async () => {
    renderOverlay(() => undefined);
    const frame = document.querySelector("[data-image-preview-frame]") as HTMLElement | null;
    const img = frame?.querySelector("img") as HTMLElement | null;
    const width = frame?.style.width;
    const height = frame?.style.height;

    await act(async () => {
      document
        .querySelector('[data-image-preview-toolbar-action="zoom-in"]')
        ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(frame?.style.width).toBe(width);
    expect(frame?.style.height).toBe(height);
    expect(img?.style.transform).toContain("scale(1.25)");
    expect(document.querySelector("[data-image-preview-toolbar]")).not.toBeNull();
  });

  it("pans the image inside the fixed frame", async () => {
    renderOverlay(() => undefined);
    const canvas = document.querySelector("[data-image-preview-canvas]");
    const img = canvas?.querySelector("img") as HTMLElement | null;
    const PointerEvent = window.PointerEvent;

    await act(async () => {
      canvas?.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }));
      canvas?.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 25,
      }));
      canvas?.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 25,
      }));
    });

    expect(img?.style.transform).toContain("translate(30px, 15px)");
  });
});

function renderOverlay(
  onClose: () => void,
  extra?: { onSaveAnnotation?: (file: File) => void },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImagePreviewOverlay
        alt="shot"
        src={PNG_SRC}
        durationMs={0}
        onClose={onClose}
        onSaveAnnotation={extra?.onSaveAnnotation}
      />,
    );
  });
  return container;
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;

  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
  setGlobal("PointerEvent", win.PointerEvent);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

function cleanupDom(): void {
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Text",
    "Event",
    "MouseEvent",
    "PointerEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
