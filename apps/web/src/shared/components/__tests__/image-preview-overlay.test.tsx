// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      copyImage: "Copy image",
      copyFailedTitle: "Copy failed",
      clipboardUnavailable: "Could not copy the image to the clipboard.",
    })[key] ?? key,
}));

const { ImagePreviewOverlay } = await import("../image-preview-overlay");

const PNG_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let root: Root | null = null;

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
});

function renderOverlay(onClose: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImagePreviewOverlay alt="shot" src={PNG_SRC} onClose={onClose} />,
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
