import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import {
  MD_LIVE_INLINE_CODE_ZWSP,
  formatMdLiveSerializedMarkdown,
  getEditorMarkdown,
  mdLiveInlineCodePlugin,
  mdLiveInsertEmptyInlineCode,
  runBlockAction,
} from "@atmos/md-live/ui";

let previousWindow: PropertyDescriptor | undefined;
let previousDocument: PropertyDescriptor | undefined;

function installDom(): void {
  const win = new Window({ url: "https://app.atmos.local/" });
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: win.document,
    writable: true,
  });
}

function restoreDom(): void {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else delete (globalThis as { window?: unknown }).window;
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else delete (globalThis as { document?: unknown }).document;
}

async function createEditor(source = "") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark)
    .use(mdLiveInlineCodePlugin)
    .use(gfm);
  await editor.create();
  return editor;
}

function visibleCode(editor: Editor): string {
  return codeText(editor).replaceAll(MD_LIVE_INLINE_CODE_ZWSP, "");
}

function codeText(editor: Editor): string {
  let text = "";
  editor.action((ctx) => {
    const type = ctx.get(editorViewCtx).state.schema.marks.inlineCode;
    ctx.get(editorViewCtx).state.doc.descendants((node) => {
      if (node.isText && type && type.isInSet(node.marks)) text += node.text ?? "";
    });
  });
  return text;
}

function dispatchKey(editor: Editor, key: "Backspace" | "Delete"): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    return Boolean(view.someProp("handleKeyDown", (fn) => fn(view, event)));
  });
}

function typeChars(editor: Editor, text: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    for (const char of text) {
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (fn) => fn(view, from, to, char));
      if (!handled) view.dispatch(view.state.tr.insertText(char));
    }
  });
}

describe("md-live inline code", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("slash insert creates an empty code chip with the caret inside", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      runBlockAction(ctx, { type: "inline-code" });
    });
    expect(visibleCode(editor)).toBe("");
    expect(codeText(editor).includes(MD_LIVE_INLINE_CODE_ZWSP)).toBe(true);
    const inside = editor.action((ctx) => {
      const { $from } = ctx.get(editorViewCtx).state.selection;
      return $from.marks().some((mark) => mark.type.name === "inlineCode");
    });
    expect(inside).toBe(true);
    expect(formatMdLiveSerializedMarkdown(editor.action((ctx) => getEditorMarkdown(ctx)))).not.toContain(MD_LIVE_INLINE_CODE_ZWSP);
    await editor.destroy();
  });

  test("typing into an empty chip replaces the placeholder", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = mdLiveInsertEmptyInlineCode(view.state);
      if (tr) view.dispatch(tr);
    });
    typeChars(editor, "x");
    expect(codeText(editor)).toBe("x");
    await editor.destroy();
  });

  test("backspace on the last character keeps an empty chip, then removes it", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const tr = mdLiveInsertEmptyInlineCode(view.state);
      if (tr) view.dispatch(tr);
    });
    typeChars(editor, "a");
    expect(codeText(editor)).toBe("a");
    expect(dispatchKey(editor, "Backspace")).toBe(true);
    expect(visibleCode(editor)).toBe("");
    expect(codeText(editor).includes(MD_LIVE_INLINE_CODE_ZWSP)).toBe(true);
    expect(dispatchKey(editor, "Backspace")).toBe(true);
    expect(codeText(editor)).toBe("");
    await editor.destroy();
  });
});
