// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ComposerHandle } from "../PromptComposer";
import {
  __resetAiContextPayloadsForTests,
  materializeAiContextText,
  wrapAiContextClipboard,
} from "@/shared/lib/ai-context-protocol";

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

const codeBody = [
  "## Code snippet",
  "- **File**: `src/app.ts`",
  "- **Lines**: L12",
  "",
  "```ts",
  "export const n = 1;",
  "```",
].join("\n");

let root: Root | null = null;

beforeEach(() => {
  installDom();
  __resetAiContextPayloadsForTests();
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
  __resetAiContextPayloadsForTests();
});

describe("PromptComposer AI context paste", () => {
  it("collapses code-selection clipboard into a chip and restores body on expand", async () => {
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
    if (!editor) throw new Error("PromptComposer editor not found");
    placeCaretAtEnd(editor);

    await act(async () => {
      editor.dispatchEvent(
        pasteEvent(wrapAiContextClipboard("code-selection", codeBody)),
      );
    });

    const chip = editor.querySelector("[data-kind='ai-context:code-selection']");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("app.ts");
    expect(chip?.querySelector("svg")).not.toBeNull();
    expect(latestText.trim()).toMatch(/^\[#ctx:code-selection:[a-zA-Z0-9_-]+\]$/);
    expect(materializeAiContextText(latestText.trim())).toBe(codeBody);
  });

  it("chips review-run and agent-fix envelopes", async () => {
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

    const reviewBody = "Run a full code review of the current diff.";
    await act(async () => {
      editor.dispatchEvent(
        pasteEvent(wrapAiContextClipboard("review-run", reviewBody)),
      );
    });

    expect(editor.querySelector("[data-kind='ai-context:review-run']")).not.toBeNull();
    expect(materializeAiContextText(composerRef.current?.getText().trim() ?? "")).toBe(
      reviewBody,
    );
  });

  it("renders slash command chips without a leading slash and file mentions as chips", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    await act(async () => {
      composerRef.current?.setText("/cmd:copy-request-id @file:README.md");
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    const commandChip = editor.querySelector("[data-kind='command']");
    expect(commandChip?.textContent).toBe("copy-request-id");
    expect(commandChip?.getAttribute("data-tooltip")).toBe("/copy-request-id");
    expect(composerRef.current?.getText()).toContain("/cmd:copy-request-id");
    expect(editor.querySelector("[data-tooltip='README.md']")?.textContent).toContain(
      "README.md",
    );
  });

  it("inserts a selected ACP slash command as a chip without a leading slash", async () => {
    const composerRef = React.createRef<ComposerHandle>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PromptComposer ref={composerRef} />);
    });

    await act(async () => {
      composerRef.current?.setText("/co");
      composerRef.current?.applySlashAtRange(1, 2, { kind: "command", name: "copy-request-id" });
    });

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    if (!editor) throw new Error("PromptComposer editor not found");
    const commandChip = editor.querySelector("[data-kind='command']");
    expect(commandChip?.textContent).toBe("copy-request-id");
    expect(composerRef.current?.getText().trim()).toBe("/cmd:copy-request-id");
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
