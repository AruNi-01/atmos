// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ComposerHandle } from "../PromptComposer";
import { expandUrlTokens } from "@/shared/lib/link-preview";

type TestIconProps = {
  name: string;
  isDir: boolean;
  className?: string;
};

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
  getFileIconProps: ({ className }: TestIconProps) => ({
    alt: "",
    className,
    src: "/icons/file.svg",
  }),
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count != null ? String(values.count) : key,
  createTranslator: () => (key: string, values?: { count?: number }) =>
    values?.count != null ? String(values.count) : key,
}));

mock.module("@/shared/lib/link-preview-query", () => ({
  fetchLinkPreview: async () => {
    throw new Error("offline");
  },
  peekLinkPreview: () => null,
}));

const { PromptComposer } = await import("../PromptComposer");

let root: Root | null = null;

describe("PromptComposer URL chips", () => {
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

  it("collapses a pasted http URL into a title chip and expands it on send", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    let latestText = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const url = "https://payloadcms.com/docs/components";

    await act(async () => {
      root?.render(
        <PromptComposer
          ref={composerRef}
          onTextChange={(text) => {
            latestText = text;
          }}
        />,
      );
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent(url));
    });

    const chip = editor.querySelector("[data-kind='url']");
    expect(chip).not.toBeNull();
    expect(chip?.className).toContain("rounded-full");
    expect(chip?.className).toContain("h-[18px]");
    expect(chip?.className).toContain("align-top");
    expect((chip as HTMLElement).style.height).toBe("18px");
    expect((chip as HTMLElement).style.verticalAlign).toBe("top");
    expect(chip?.textContent).toContain("payloadcms.com");
    expect(latestText.trim()).toMatch(/^\[#url:/);
    expect(expandUrlTokens(latestText.trim())).toBe(url);
  });

  it("places the caret after a pasted URL chip even when insertHTML leaves it before", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const url = "https://payloadcms.com/docs/components";

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string, _showUI: boolean, value?: string) => {
        if (command !== "insertHTML" || typeof value !== "string") return false;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;
        const range = selection.getRangeAt(0);
        const temp = document.createElement("div");
        temp.innerHTML = value;
        const fragment = document.createDocumentFragment();
        while (temp.firstChild) fragment.appendChild(temp.firstChild);
        const first = fragment.firstChild;
        range.deleteContents();
        range.insertNode(fragment);
        if (first) {
          range.setStartBefore(first);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        return true;
      },
    });

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent(url));
    });

    const chip = editor.querySelector("[data-kind='url']");
    if (!chip) throw new Error("URL chip not found");
    expect(selectionIsAtOrAfterNode(chip)).toBe(true);
  });

  it("expands a URL chip back to a dashed link on click", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const url = "https://payloadcms.com/docs/components";

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent(url));
    });

    const chip = editor.querySelector("[data-kind='url']");
    if (!chip) throw new Error("URL chip not found");

    await act(async () => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(editor.querySelector("[data-kind='url']")).toBeNull();
    const link = editor.querySelector<HTMLElement>("[data-http-text-link]");
    expect(link).not.toBeNull();
    expect(link?.tagName).toBe("SPAN");
    expect(link?.getAttribute("contenteditable")).not.toBe("false");
    expect(link?.getAttribute("href")).toBeNull();
    expect(link?.getAttribute("data-url")).toBe(url);
    expect(link?.textContent).toBe(url);
    expect(link?.className).toContain("decoration-dashed");
    expect(link?.className).toContain("cursor-text");
    expect(composerRef.current?.getText().trim()).toBe(url);
  });

  it("keeps OG hover preview on expanded composer URL text", () => {
    const source = readFileSync(
      join(import.meta.dir, "../PromptComposer.tsx"),
      "utf8",
    );
    expect(source).toContain("[data-kind='url'], [data-kind='url-link']");
    expect(source).toContain("urlFromComposerUrlEl");
  });

  it("leaves mixed text pastes as plain text", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent("see https://example.com please"));
    });

    expect(editor.querySelector("[data-kind='url']")).toBeNull();
    expect(composerRef.current?.getText()).toBe("see https://example.com please");
  });

  it("does not chip a typed URL", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const url = "https://example.com/docs";

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    await act(async () => {
      composerRef.current?.setText(url);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    expect(editor?.querySelector("[data-kind='url']")).toBeNull();
    expect(composerRef.current?.getText()).toBe(url);
  });

  it("breaks the dashed URL mark on space so following text is plain", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const url = "https://payloadcms.com/docs/components";

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent(url));
    });

    const chip = editor.querySelector("[data-kind='url']");
    if (!chip) throw new Error("URL chip not found");

    await act(async () => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const link = editor.querySelector<HTMLElement>("[data-kind='url-link']");
    expect(link).not.toBeNull();

    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const mark = editor.querySelector<HTMLElement>("[data-kind='url-link']");
    expect(mark?.textContent).toBe(url);
    expect(mark?.nextSibling?.textContent?.startsWith(" ")).toBe(true);
    expect(composerRef.current?.getText()).toBe(`${url} `);
  });
});

function pasteEvent(text: string): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
      items: [],
    },
  });
  return event;
}

function placeCaretAtEnd(element: HTMLElement): void {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectionIsAtOrAfterNode(node: Node): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const caret = selection.getRangeAt(0);
  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  return caret.compareBoundaryPoints(0, after) >= 0;
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window &
    typeof globalThis & {
      ResizeObserver?: typeof ResizeObserver;
    };

  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
  setGlobal("KeyboardEvent", win.KeyboardEvent);
  setGlobal("MutationObserver", win.MutationObserver);
  setGlobal("Range", win.Range);
  setGlobal("ResizeObserver", win.ResizeObserver);
  setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  win.SyntaxError = SyntaxError;
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
    "KeyboardEvent",
    "MutationObserver",
    "Range",
    "ResizeObserver",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>)[key];
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
