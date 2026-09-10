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

const { ImageCopyMenuHost } = await import("../image-copy-context-menu");

const PNG_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let root: Root | null = null;

describe("ImageCopyMenuHost", () => {
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

  it("copies from a small preview without opening an overlay", async () => {
    const onPreview = mock(() => undefined);
    renderHost(onPreview);

    expect(document.querySelector("[data-image-preview-context-menu]")).toBeNull();

    const thumb = document.querySelector("[data-image-thumb]");
    await act(async () => {
      thumb?.dispatchEvent(
        new window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 32,
          clientY: 20,
        }),
      );
    });

    const menu = document.querySelector("[data-image-preview-context-menu]");
    expect(menu).not.toBeNull();
    expect(menu?.querySelector("[data-image-preview-copy]")).not.toBeNull();
    expect(menu?.textContent).toMatch(/Copy image|copyImage/);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("does not treat right-click as a preview click", async () => {
    const onPreview = mock(() => undefined);
    renderHost(onPreview);

    const thumb = document.querySelector("[data-image-thumb]");
    const event = new window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 12,
    });
    await act(async () => {
      thumb?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(onPreview).not.toHaveBeenCalled();
  });
});

function renderHost(onPreview: () => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImageCopyMenuHost src={PNG_SRC}>
        <button type="button" data-image-thumb="" onClick={onPreview}>
          {/* eslint-disable-next-line @next/next/no-img-element -- test fixture uses a data URL. */}
          <img src={PNG_SRC} alt="shot" />
        </button>
      </ImageCopyMenuHost>,
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
