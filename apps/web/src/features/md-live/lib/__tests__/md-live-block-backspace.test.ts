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
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { splitBlock } from "@milkdown/kit/prose/commands";
import {
  MD_LIVE_INLINE_CODE_ZWSP,
  focusEditorCaret,
  isolateSelectedTextblock,
  mdLiveBlockBackspace,
  mdLiveBlockBackspacePlugin,
  mdLiveInlineCodePlugin,
  mdLiveVisibleConvertIds,
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
    .use(mdLiveInlineCodePlugin)
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

describe("md-live convert isolate", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("mid-line selection becomes its own paragraph", async () => {
    const editor = await createEditor("hello world foo\n");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const start = textblockStart(view.state.doc, "paragraph");
      if (start == null) throw new Error("missing paragraph");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start + 6, start + 11)));
      const tr = isolateSelectedTextblock(view.state);
      expect(tr).not.toBeNull();
      if (tr) view.dispatch(tr);
      expect(view.state.selection.$from.parent.textContent).toBe("world");
    });
    const texts: string[] = [];
    editor.action((ctx) => {
      ctx.get(editorViewCtx).state.doc.descendants((node) => {
        if (node.isTextblock) texts.push(node.textContent);
      });
    });
    expect(texts).toEqual(["hello ", "world", " foo"]);
    await editor.destroy();
  });

  test("whole-block selection does not split", async () => {
    const editor = await createEditor("hello\n");
    const split = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const start = textblockStart(view.state.doc, "paragraph");
      if (start == null) throw new Error("missing paragraph");
      const end = start + 5;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, end)));
      return isolateSelectedTextblock(view.state);
    });
    expect(split).toBeNull();
    await editor.destroy();
  });

  test("paragraph selection can convert to lists, toggle, and headings", async () => {
    const editor = await createEditor("hello\n");
    const ids = editor.action((ctx) => mdLiveVisibleConvertIds(ctx.get(editorViewCtx).state));
    expect(ids).toContain("ul");
    expect(ids).toContain("ol");
    expect(ids).toContain("todo");
    expect(ids).toContain("toggle");
    expect(ids).toContain("h2");
    await editor.destroy();
  });
});

describe("md-live editor caret", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("focusEditorCaret puts the caret at the start of the first textblock", async () => {
    const editor = await createEditor("Hello\n");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const inside = Math.min(view.state.doc.content.size - 1, 4);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inside)));
      focusEditorCaret(ctx);
    });
    const from = editor.action((ctx) => ctx.get(editorViewCtx).state.selection.from);
    expect(from).toBe(1);
    await editor.destroy();
  });
});

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
    const editor = await createEditor("> \n");
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
    const editor = await createEditor("- \n");
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

  test("typing '## ' keeps an H2 instead of dropping back to a paragraph", async () => {
    const editor = await createEditor("");
    typeChars(editor, "## ");
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 2, text: "" });
    await editor.destroy();
  });

  test("typing '##### ' becomes an H5 even though slash stops at H4", async () => {
    const editor = await createEditor("");
    typeChars(editor, "##### ");
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 5, text: "" });
    await editor.destroy();
  });

  test("typing '###### ' becomes an H6 even though slash stops at H4", async () => {
    const editor = await createEditor("");
    typeChars(editor, "###### ");
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 6, text: "" });
    await editor.destroy();
  });

  test("after enter, ## space still becomes an H2", async () => {
    const editor = await createEditor("Hello\n");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const end = Math.max(1, view.state.doc.content.size - 1);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
      splitBlock(view.state, view.dispatch);
    });
    typeChars(editor, "## ");
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 2, text: "" });
    await editor.destroy();
  });

  test("an unmarked zwsp does not block heading shortcuts", async () => {
    const editor = await createEditor("");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText(`${MD_LIVE_INLINE_CODE_ZWSP}##`));
    });
    typeChars(editor, " ");
    expect(blockAtCaret(editor)).toMatchObject({ name: "heading", level: 2 });
    await editor.destroy();
  });

  test("typing '/' keeps the slash instead of deleting it", async () => {
    const editor = await createEditor("");
    typeChars(editor, "/");
    expect(blockAtCaret(editor)).toMatchObject({ name: "paragraph", text: "/" });
    await editor.destroy();
  });

  test("an inserted empty paragraph stays in the document", async () => {
    const editor = await createEditor("Hello\n");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const paragraph = view.state.schema.nodes.paragraph;
      if (!paragraph) throw new Error("missing paragraph");
      const end = view.state.doc.content.size;
      const tr = view.state.tr.insert(end, paragraph.create());
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)));
    });
    const paragraphs = editor.action((ctx) => {
      let count = 0;
      ctx.get(editorViewCtx).state.doc.descendants((node) => {
        if (node.type.name === "paragraph") count += 1;
      });
      return count;
    });
    expect(paragraphs).toBeGreaterThanOrEqual(2);
    expect(blockAtCaret(editor).name).toBe("paragraph");
    await editor.destroy();
  });
});
