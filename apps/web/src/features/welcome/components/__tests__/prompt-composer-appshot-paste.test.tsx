// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ComposerHandle } from "../PromptComposer";

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

const { PromptComposer } = await import("../PromptComposer");

const timestamp = "1760000000000";
let root: Root | null = null;

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

describe("PromptComposer Appshot paste handling", () => {
  it("collapses first-line Appshot protocol text into an Appshot chip token", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    let latestText = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

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
    if (!editor) {
      throw new Error("PromptComposer editor not found");
    }
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(
        pasteEvent(
          `atmos://appshots/${timestamp}\nAppshot record is stored locally at ~/.atmos/appshots/records/${timestamp}/.`,
        ),
      );
    });

    expect(editor.textContent).toContain(`Appshot · ${timestamp}`);
    expect(editor.querySelector("[data-kind='appshot'] [aria-hidden='true']")).not.toBeNull();
    expect(latestText.trim()).toBe(`[#appshot:${timestamp}]`);
    expect(composerRef.current?.getText().trim()).toBe(`[#appshot:${timestamp}]`);
  });

  it("deletes a pasted Appshot chip with one Backspace from the end", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    let latestText = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

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
    if (!editor) {
      throw new Error("PromptComposer editor not found");
    }
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(
        pasteEvent(
          `atmos://appshots/${timestamp}\nAppshot record is stored locally at ~/.atmos/appshots/records/${timestamp}/.`,
        ),
      );
    });

    await act(async () => {
      editor.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Backspace",
        }),
      );
    });

    expect(editor.querySelector("[data-kind='appshot']")).toBeNull();
    expect(latestText.trim()).toBe("");
    expect(composerRef.current?.getText().trim()).toBe("");
  });

  it("deletes an Appshot chip with one Delete when the caret is before it", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    let latestText = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

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

    await act(async () => {
      composerRef.current?.setText(`[#appshot:${timestamp}]`);
    });
    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    const chip = editor?.querySelector<HTMLElement>("[data-kind='appshot']");
    if (!editor || !chip) {
      throw new Error("PromptComposer Appshot chip not found");
    }
    placeCaretBefore(chip);

    await act(async () => {
      editor.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Delete",
        }),
      );
    });

    expect(editor.querySelector("[data-kind='appshot']")).toBeNull();
    expect(latestText.trim()).toBe("");
    expect(composerRef.current?.getText().trim()).toBe("");
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

function placeCaretBefore(element: HTMLElement): void {
  const range = document.createRange();
  range.setStartBefore(element);
  range.collapse(true);
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
    "KeyboardEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });
}
