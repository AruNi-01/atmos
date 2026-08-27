import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  Editor,
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import {
  commonmark,
  createCodeBlockCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { mdLiveBlockBackspace, mdLiveBlockBackspacePlugin } from "@atmos/md-live/ui";

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

function textblockStart(doc: Node, name: string): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.isTextblock && (name === "*" || node.type.name === name)) {
      found = pos + 1;
      return false;
    }
  });
  return found;
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
    .use(gfm)
    .use(mdLiveBlockBackspacePlugin);
  await editor.create();
  return editor;
}

function dispatchBackspace(editor: Editor): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = mdLiveBlockBackspace(view.state);
    if (!tr) return false;
    view.dispatch(tr);
    return true;
  });
}

function blockAtCaret(editor: Editor): { name: string; level?: number; text: string } {
  return editor.action((ctx) => {
    const { $from } = ctx.get(editorViewCtx).state.selection;
    const node = $from.parent;
    return {
      name: node.type.name,
      level: typeof node.attrs.level === "number" ? node.attrs.level : undefined,
      text: node.textContent,
    };
  });
}

describe("md-live block backspace", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("empty H2 backspace becomes a paragraph, not H1", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(wrapInHeadingCommand.key, 2);
    });
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 2, text: "" });
    expect(dispatchBackspace(editor)).toBe(true);
    expect(blockAtCaret(editor)).toMatchObject({ name: "paragraph", text: "" });
    expect(blockAtCaret(editor).level).toBeUndefined();
    await editor.destroy();
  });

  test("H2 with text at the start unwraps in one step, not to H1", async () => {
    const editor = await createEditor("## Hello\n");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = textblockStart(view.state.doc, "heading");
      if (pos == null) throw new Error("missing heading");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    });
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 2, text: "Hello" });
    expect(dispatchBackspace(editor)).toBe(true);
    expect(blockAtCaret(editor)).toMatchObject({ name: "paragraph", text: "Hello" });
    expect(blockAtCaret(editor).level).toBeUndefined();
    await editor.destroy();
  });

  test("backspace in the middle of a heading still deletes by character", async () => {
    const editor = await createEditor("## Hello\n");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const pos = textblockStart(view.state.doc, "heading");
      if (pos == null) throw new Error("missing heading");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 3)));
    });
    expect(dispatchBackspace(editor)).toBe(false);
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 2, text: "Hello" });
    await editor.destroy();
  });

  test("empty code block backspace becomes a paragraph", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(createCodeBlockCommand.key);
    });
    expect(blockAtCaret(editor).name).toBe("code_block");
    expect(dispatchBackspace(editor)).toBe(true);
    expect(blockAtCaret(editor).name).toBe("paragraph");
    await editor.destroy();
  });

  test("empty quote backspace removes the quote block", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key);
    });
    const quoted = editor.action((ctx) => {
      const { $from } = ctx.get(editorViewCtx).state.selection;
      return $from.node($from.depth - 1)?.type.name;
    });
    expect(quoted).toBe("blockquote");
    expect(dispatchBackspace(editor)).toBe(true);
    const after = editor.action((ctx) => {
      const { $from } = ctx.get(editorViewCtx).state.selection;
      return {
        parent: $from.parent.type.name,
        wrap: $from.depth > 1 ? $from.node($from.depth - 1).type.name : $from.parent.type.name,
      };
    });
    expect(after.parent).toBe("paragraph");
    expect(after.wrap).not.toBe("blockquote");
    await editor.destroy();
  });

  test("empty single-item list backspace removes the list", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      ctx.get(commandsCtx).call(wrapInBulletListCommand.key);
    });
    const listed = editor.action((ctx) => {
      const { $from } = ctx.get(editorViewCtx).state.selection;
      return $from.node($from.depth - 1)?.type.name;
    });
    expect(listed).toBe("list_item");
    expect(dispatchBackspace(editor)).toBe(true);
    const after = editor.action((ctx) => {
      const { $from } = ctx.get(editorViewCtx).state.selection;
      return $from.node($from.depth - 1)?.type.name ?? $from.parent.type.name;
    });
    expect(after).not.toBe("list_item");
    expect(blockAtCaret(editor).name).toBe("paragraph");
    await editor.destroy();
  });
});
