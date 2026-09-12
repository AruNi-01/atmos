// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ComposerHandle } from "../PromptComposer";
import {
  __resetComposerPasteForTests,
  expandPasteTokens,
} from "@/shared/lib/composer-paste";

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

const { PromptComposer } = await import("../PromptComposer");

function manyLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `paste line ${i + 1}`).join("\n");
}

let root: Root | null = null;

beforeEach(() => {
  installDom();
  __resetComposerPasteForTests();
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
  __resetComposerPasteForTests();
});

describe("PromptComposer large paste chips", () => {
  it("keeps chips inside the 20px agent editor line box", () => {
    const source = readFileSync(join(import.meta.dir, "../PromptComposer.tsx"), "utf8");
    expect(source).toContain("COMPOSER_CHIP_LINE_PX = 18");
    expect(source).toContain("applyComposerChipLineMetrics");
    expect(source).toContain("align-top");
    expect(source).toContain("h-[18px]");
  });

  it("records plain-text paste through the native undo transaction", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const execCommand = mock(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await act(async () => {
      root?.render(<PromptComposer />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent("Pasted text"));
    });

    expect(execCommand).toHaveBeenCalledWith("insertText", false, "Pasted text");
  });

  it("collapses pastes over 10 lines into a chip and expands the body on send", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    let latestText = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const body = manyLines(12);

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
      editor.dispatchEvent(pasteEvent(body));
    });

    const chip = editor.querySelector("[data-kind='paste']");
    expect(chip).not.toBeNull();
    expect(chip?.className).toContain("rounded-full");
    expect(chip?.className).toContain("h-[18px]");
    expect(chip?.className).toContain("align-top");
    expect((chip as HTMLElement).style.height).toBe("18px");
    expect((chip as HTMLElement).style.verticalAlign).toBe("top");
    expect(chip?.textContent).toContain("12");
    expect(editor.querySelectorAll("br").length).toBe(0);
    expect(latestText.trim()).toMatch(/^\[#paste:[a-zA-Z0-9_-]+\]$/);
    expect(expandPasteTokens(latestText.trim())).toBe(body);

    await act(async () => {
      chip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const tooltip = document.querySelector("[data-slot='follow-hover-card']");
    expect(tooltip?.textContent).toContain("paste line 1");
    expect(tooltip?.textContent).toContain("paste line 12");
    expect(tooltip?.textContent).toMatch(/6/);
  });

  it("inserts 10-line pastes as text instead of a chip", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const body = manyLines(10);

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent(body));
    });

    expect(editor.querySelector("[data-kind='paste']")).toBeNull();
    expect(composerRef.current?.getText()).toBe(body);
  });

  it("expands a paste chip in place on click and does not chip it again", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const body = manyLines(11);

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(pasteEvent(body));
    });

    const chip = editor.querySelector("[data-kind='paste']");
    if (!chip) throw new Error("paste chip not found");

    await act(async () => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(editor.querySelector("[data-kind='paste']")).toBeNull();
    expect(composerRef.current?.getText()).toBe(body);
    expect(editor.querySelectorAll("br").length).toBe(0);
    const textNodes = [...editor.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
    expect(textNodes).toHaveLength(1);
    expect(textNodes[0]?.textContent).toBe(body);
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
