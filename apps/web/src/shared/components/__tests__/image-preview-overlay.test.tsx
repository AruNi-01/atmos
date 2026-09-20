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
  IMAGE_PREVIEW_STAGE_RATIO,
  IMAGE_PREVIEW_TOOLBAR_GAP_PX,
  IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX,
  IMAGE_PREVIEW_TOOLBAR_TOP_GAP_PX,
  ImagePreviewOverlay,
  imagePreviewContainedSize,
  imagePreviewImageRect,
  imagePreviewScaledRadius,
  imagePreviewStageRect,
  imagePreviewTargetRect,
  imagePreviewZoomTransform,
} = await import("../image-preview-overlay");

function expectedStage(viewport: { width: number; height: number }) {
  const width = Math.round(viewport.width * IMAGE_PREVIEW_STAGE_RATIO);
  const left = Math.round((viewport.width - width) / 2);
  const top =
    IMAGE_PREVIEW_TOOLBAR_TOP_GAP_PX
    + IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX
    + IMAGE_PREVIEW_TOOLBAR_GAP_PX;
  const bottomInset = Math.round(viewport.height * (1 - IMAGE_PREVIEW_STAGE_RATIO) / 2);
  return {
    left,
    top,
    width,
    height: viewport.height - top - bottomInset,
    toolbarGap: IMAGE_PREVIEW_TOOLBAR_GAP_PX,
  };
}

const PNG_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let root: Root | null = null;

describe("image preview zoom geometry", () => {
  it("uses a 95% stage with a fixed toolbar top and keeps small images at natural size", () => {
    const origin = {
      left: 100,
      top: 200,
      width: 80,
      height: 80,
      radius: 12,
      naturalWidth: 80,
      naturalHeight: 80,
    };
    const viewport = { width: 1000, height: 800 };
    const expected = expectedStage(viewport);
    const stage = imagePreviewStageRect(viewport);
    expect(stage.width).toBe(expected.width);
    expect(stage.height).toBe(expected.height);
    expect(stage.left).toBe(expected.left);
    expect(stage.top).toBe(expected.top);
    expect(stage.toolbarGap).toBe(IMAGE_PREVIEW_TOOLBAR_GAP_PX);
    expect(stage.top - stage.toolbarGap - IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX).toBe(
      IMAGE_PREVIEW_TOOLBAR_TOP_GAP_PX,
    );

    const target = imagePreviewTargetRect(origin, viewport);
    expect(target.width).toBe(stage.width);
    expect(target.height).toBe(stage.height);
    expect(target.left).toBe(stage.left);
    expect(target.top).toBe(stage.top);

    expect(imagePreviewContainedSize({ width: 80, height: 80 }, stage)).toEqual({
      width: 80,
      height: 80,
    });
    expect(imagePreviewContainedSize({ width: 2000, height: 1000 }, stage)).toEqual({
      width: 950,
      height: 475,
    });

    const image = imagePreviewImageRect(origin, viewport);
    expect(image.width).toBe(80);
    expect(image.height).toBe(80);
    expect(image.left).toBe(stage.left + Math.round((stage.width - 80) / 2));
    expect(image.top).toBe(stage.top + Math.round((stage.height - 80) / 2));

    const zoom = imagePreviewZoomTransform(origin, image);
    expect(zoom.scale).toBeCloseTo(origin.width / image.width);
    expect(zoom.x).toBeCloseTo(origin.left + origin.width / 2 - (image.left + image.width / 2));
    expect(zoom.y).toBeCloseTo(origin.top + origin.height / 2 - (image.top + image.height / 2));
    expect(imagePreviewScaledRadius(12, zoom.scale) * zoom.scale).toBeCloseTo(12);
  });

  it("keeps a fixed toolbar band and expands left, right, and bottom to 95%", () => {
    const viewport = { width: 2000, height: 1200 };
    const stage = imagePreviewStageRect(viewport);
    const expected = expectedStage(viewport);
    expect(stage).toEqual(expected);
    expect(stage.width / viewport.width).toBeCloseTo(0.95);
    expect(stage.top + stage.height).toBe(viewport.height - Math.round(viewport.height * 0.025));
  });

  it("keeps the fixed toolbar band on a short viewport and still fits the stage", () => {
    const stage = imagePreviewStageRect({ width: 400, height: 400 });
    expect(stage.toolbarGap).toBe(IMAGE_PREVIEW_TOOLBAR_GAP_PX);
    expect(stage.top).toBe(
      IMAGE_PREVIEW_TOOLBAR_TOP_GAP_PX
        + IMAGE_PREVIEW_TOOLBAR_HEIGHT_PX
        + IMAGE_PREVIEW_TOOLBAR_GAP_PX,
    );
    expect(stage.top + stage.height).toBeLessThanOrEqual(400);
    expect(stage.width).toBe(380);
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

  it("renders a stage-pinned pill toolbar with zoom, copy, download, and close", async () => {
    renderOverlay(() => undefined);

    const toolbar = document.querySelector("[data-image-preview-toolbar]");
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).toContain("absolute");
    expect(toolbar?.className).toContain("right-0");
    expect((toolbar as HTMLElement | null)?.style.bottom).toBe("100%");
    expect(Number.parseFloat((toolbar as HTMLElement).style.marginBottom)).toBe(
      IMAGE_PREVIEW_TOOLBAR_GAP_PX,
    );
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="zoom-out"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="zoom-in"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="copy"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="download"]')).not.toBeNull();
    expect(toolbar?.querySelector('[data-image-preview-toolbar-action="close"]')).not.toBeNull();
    expect(toolbar?.querySelectorAll("button")).toHaveLength(5);
  });

  it("pins the preview stage to 95% and keeps a small image inside it", async () => {
    renderOverlay(() => undefined, {
      originRect: {
        left: 20,
        top: 30,
        width: 48,
        height: 48,
        radius: 8,
        naturalWidth: 48,
        naturalHeight: 32,
      },
    });

    const frame = document.querySelector("[data-image-preview-frame]") as HTMLElement | null;
    const stage = document.querySelector("[data-image-preview-stage]");
    const media = document.querySelector("[data-image-preview-media]") as HTMLElement | null;
    const clip = document.querySelector("[data-image-preview-canvas]") as HTMLElement | null;
    const toolbar = document.querySelector("[data-image-preview-toolbar]");

    const expected = expectedStage({ width: 1000, height: 800 });
    expect(frame?.style.width).toBe(`${expected.width}px`);
    expect(frame?.style.height).toBe(`${expected.height}px`);
    expect(frame?.style.top).toBe(`${expected.top}px`);
    expect(stage).not.toBeNull();
    expect(media?.style.width).toBe("48px");
    expect(media?.style.height).toBe("32px");
    expect(clip?.style.overflow).toBe("hidden");
    expect(toolbar?.parentElement).toBe(frame);
    expect(toolbar?.className).toContain("right-0");
    expect((toolbar as HTMLElement | null)?.style.bottom).toBe("100%");
    expect(Number.parseFloat((toolbar as HTMLElement).style.marginBottom)).toBe(
      IMAGE_PREVIEW_TOOLBAR_GAP_PX,
    );
    expect(Number.parseFloat(frame?.style.top ?? "0")).toBe(expected.top);
  });

  it("contains an oversized image inside the stage instead of growing the frame", async () => {
    renderOverlay(() => undefined, {
      originRect: {
        left: 20,
        top: 30,
        width: 80,
        height: 40,
        radius: 8,
        naturalWidth: 2000,
        naturalHeight: 1000,
      },
    });

    const frame = document.querySelector("[data-image-preview-frame]") as HTMLElement | null;
    const media = document.querySelector("[data-image-preview-media]") as HTMLElement | null;
    const toolbar = document.querySelector("[data-image-preview-toolbar]");
    const expected = expectedStage({ width: 1000, height: 800 });
    expect(frame?.style.width).toBe(`${expected.width}px`);
    expect(frame?.style.height).toBe(`${expected.height}px`);
    expect(media?.style.width).toBe("950px");
    expect(media?.style.height).toBe("475px");
    expect(toolbar?.parentElement).toBe(frame);
    expect(media?.contains(toolbar)).toBe(false);
  });

  it("uses PencilSparkles for the composer draw action", async () => {
    const source = await Bun.file(new URL("../image-preview-overlay.tsx", import.meta.url)).text();
    expect(source).toContain("PencilSparkles");
    expect(source).not.toContain("Paintbrush");
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

  it("clips expanded image corners and interpolates radius while closing", async () => {
    const originRect = {
      left: 20,
      top: 30,
      width: 80,
      height: 40,
      radius: 12,
      naturalWidth: 2000,
      naturalHeight: 1000,
    };
    renderOverlay(() => undefined, { durationMs: 200, originRect });

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const media = document.querySelector("[data-image-preview-media]") as HTMLElement | null;
    expect(media?.style.overflow).toBe("hidden");
    expect(media?.style.borderRadius).toBe("0px");
    expect(media?.style.clipPath).toBe("inset(0 round 0px)");
    expect(media?.style.transition).toContain("border-radius");
    expect(media?.style.transition).toContain("clip-path");

    await act(async () => {
      document
        .querySelector('[data-image-preview-toolbar-action="close"]')
        ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    const closedRadius = Number.parseFloat(media?.style.borderRadius ?? "");
    expect(media?.style.overflow).toBe("hidden");
    expect(closedRadius).toBeGreaterThan(12);
    expect(media?.style.clipPath).toBe(`inset(0 round ${closedRadius}px)`);
    expect(media?.style.transition).toContain("border-radius");
    expect(media?.style.transition).toContain("clip-path");
  });
});

function renderOverlay(
  onClose: () => void,
  extra?: {
    onSaveAnnotation?: (file: File) => void;
    durationMs?: number;
    originRect?: {
      left: number;
      top: number;
      width: number;
      height: number;
      radius: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
  },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImagePreviewOverlay
        alt="shot"
        src={PNG_SRC}
        durationMs={extra?.durationMs ?? 0}
        onClose={onClose}
        originRect={extra?.originRect}
        onSaveAnnotation={extra?.onSaveAnnotation}
      />,
    );
  });
  return container;
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;
  Object.defineProperty(win, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(win, "innerHeight", { configurable: true, value: 800 });

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
