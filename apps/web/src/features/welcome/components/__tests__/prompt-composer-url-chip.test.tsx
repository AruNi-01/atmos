// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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
