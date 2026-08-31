// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
  usePromptInputAttachments: () => ({
    files: [],
    add: () => undefined,
    remove: () => undefined,
    clear: () => undefined,
    openFileDialog: () => undefined,
    fileInputRef: { current: null },
  }),
}));

const translate = (key: string, values?: Record<string, string | number>) => {
  if (!values) return key;
  return `${key}:${JSON.stringify(values)}`;
};

mock.module("next-intl", () => ({
  useTranslations: () => translate,
}));

const { AgentComposerAttachmentList } = await import("../AgentComposerAttachments");

let root: Root | null = null;

describe("agent composer attachments", () => {
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

  it("renders image tiles and file pills together", async () => {
    const container = renderList({
      files: [
        {
          id: "img-1",
          filename: "shot.png",
          mediaType: "image/png",
          url: "blob:shot",
        },
        {
          id: "file-1",
          filename: "summer-menu.pdf",
          mediaType: "application/pdf",
          url: "blob:menu",
        },
      ],
      onRemove: () => undefined,
    });

    const image = container.querySelector('[data-agent-composer-attachment="image"]');
    const file = container.querySelector('[data-agent-composer-attachment="file"]');
    expect(image).not.toBeNull();
    expect(file).not.toBeNull();
    expect(image?.className).toContain("group");
    expect(image?.querySelector("button")?.className).toContain("rounded-2xl");
    expect(image?.querySelector("button")?.className).toContain("cursor-zoom-in");
    expect(file?.className).toContain("rounded-full");
    expect(file?.textContent).toContain("summer-menu.pdf");

    const imageRemove = image?.querySelectorAll("button")[1];
    expect(imageRemove?.className).toContain("opacity-0");
    expect(imageRemove?.className).toContain("group-hover:opacity-100");
    expect(imageRemove?.className).toContain("top-1");
    expect(imageRemove?.className).toContain("right-1");
  });

  it("opens the existing image preview overlay on click", async () => {
    const container = renderList({
      files: [
        {
          id: "img-1",
          filename: "shot.png",
          mediaType: "image/png",
          url: "blob:shot",
        },
      ],
      onRemove: () => undefined,
    });

    const previewButton = container.querySelector(
      '[data-agent-composer-attachment="image"] button',
    );
    expect(document.querySelector("[data-image-preview-overlay]")).toBeNull();

    await act(async () => {
      previewButton?.dispatchEvent(new window.Event("click", { bubbles: true }));
    });

    const overlay = document.querySelector("[data-image-preview-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector("img")?.getAttribute("src")).toBe("blob:shot");
  });

  it("removes an image without opening the preview overlay", async () => {
    const removed: string[] = [];
    const container = renderList({
      files: [
        {
          id: "img-1",
          filename: "shot.png",
          mediaType: "image/png",
          url: "blob:shot",
        },
      ],
      onRemove: (id) => {
        removed.push(id);
      },
    });

    const removeButton = container.querySelectorAll(
      '[data-agent-composer-attachment="image"] button',
    )[1];
    await act(async () => {
      removeButton?.dispatchEvent(new window.Event("click", { bubbles: true }));
    });

    expect(removed).toEqual(["img-1"]);
    expect(document.querySelector("[data-image-preview-overlay]")).toBeNull();
  });

  it("renders TIFF as a file pill instead of a broken image tile", async () => {
    const container = renderList({
      files: [
        {
          id: "tiff-1",
          filename: "screenshot.tiff",
          mediaType: "image/tiff",
          url: "blob:tiff",
        },
      ],
      onRemove: () => undefined,
    });

    expect(container.querySelector('[data-agent-composer-attachment="image"]')).toBeNull();
    const file = container.querySelector('[data-agent-composer-attachment="file"]');
    expect(file).not.toBeNull();
    expect(file?.textContent).toContain("screenshot.tiff");
  });

  it("renders compact tiles without remove actions", async () => {
    const container = renderList({
      density: "compact",
      files: [
        {
          id: "img-1",
          filename: "shot.png",
          mediaType: "image/png",
          url: "blob:shot",
        },
        {
          id: "file-1",
          filename: "summer-menu.pdf",
          mediaType: "application/pdf",
          url: "blob:menu",
        },
      ],
    });

    const root = container.querySelector("[data-agent-composer-attachments]");
    const image = container.querySelector('[data-agent-composer-attachment="image"]');
    const file = container.querySelector('[data-agent-composer-attachment="file"]');
    expect(root?.getAttribute("data-density")).toBe("compact");
    expect(image?.querySelector("button")?.className).toContain("h-14");
    expect(image?.querySelector("button")?.className).toContain("w-32");
    expect(image?.querySelectorAll("button")).toHaveLength(1);
    expect(file?.querySelector("button")).toBeNull();
    expect(file?.className).toContain("h-7");
  });

  it("opens the preview overlay from a compact image tile", async () => {
    const container = renderList({
      density: "compact",
      files: [
        {
          id: "img-1",
          filename: "shot.png",
          mediaType: "image/png",
          url: "blob:shot",
        },
      ],
    });

    await act(async () => {
      container
        .querySelector('[data-agent-composer-attachment="image"] button')
        ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    });

    expect(document.querySelector("[data-image-preview-overlay]")).not.toBeNull();
  });

  it("removes files from the pill action", async () => {
    const removed: string[] = [];
    const container = renderList({
      files: [
        {
          id: "file-1",
          filename: "summer-menu.pdf",
          mediaType: "application/pdf",
          url: "blob:menu",
        },
      ],
      onRemove: (id) => {
        removed.push(id);
      },
    });

    const removeButton = container.querySelector(
      '[data-agent-composer-attachment="file"] button',
    );
    await act(async () => {
      removeButton?.dispatchEvent(new window.Event("click", { bubbles: true }));
    });

    expect(removed).toEqual(["file-1"]);
  });
});

function renderList({
  files,
  onRemove,
  density,
}: {
  files: React.ComponentProps<typeof AgentComposerAttachmentList>["files"];
  onRemove?: (id: string) => void;
  density?: React.ComponentProps<typeof AgentComposerAttachmentList>["density"];
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <AgentComposerAttachmentList
        density={density}
        files={files}
        onRemove={onRemove}
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
