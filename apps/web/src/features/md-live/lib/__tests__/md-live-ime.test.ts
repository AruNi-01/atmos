import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { headingIdGenerator } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  mdLiveCommonmark,
  mdLiveComposingPlugin,
  mdLiveHeadingIdPlugin,
  mdLiveInlineCodePlugin,
  mdLiveMarkComposing,
  mdLiveTaskListPlugins,
  slugMdLiveHeading,
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
      ctx.set(headingIdGenerator.key, (node) => slugMdLiveHeading(node.textContent));
    })
    .use(mdLiveComposingPlugin)
    .use(mdLiveCommonmark)
    .use(mdLiveInlineCodePlugin)
    .use(gfm)
    .use(mdLiveHeadingIdPlugin)
    .use(mdLiveTaskListPlugins);
  await editor.create();
  return editor;
}

function headingAt(editor: Editor): { text: string; id: string } {
  return editor.action((ctx) => {
    const heading = ctx.get(editorViewCtx).state.doc.firstChild;
    return {
      text: heading?.textContent ?? "",
      id: typeof heading?.attrs.id === "string" ? heading.attrs.id : "",
    };
  });
}

function paragraphAt(editor: Editor): string {
  return editor.action((ctx) => ctx.get(editorViewCtx).state.doc.firstChild?.textContent ?? "");
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

function headingDom(editor: Editor): unknown {
  return editor.action((ctx) => ctx.get(editorViewCtx).nodeDOM(0));
}

function caretAtEnd(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const end = view.state.selection.$from.end();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
  });
}

describe("md-live IME composition", () => {
  beforeEach(() => {
    installDom();
    mdLiveMarkComposing(false);
  });

  afterEach(() => {
    mdLiveMarkComposing(false);
    restoreDom();
  });

  test("does not rewrite heading id while composing pinyin", async () => {
    const editor = await createEditor("# 标题");
    caretAtEnd(editor);
    const before = headingAt(editor);
    expect(before.id).toBe(slugMdLiveHeading("标题"));
    const el = headingDom(editor);

    mdLiveMarkComposing(true);
    typeChars(editor, "nihao");
    const during = headingAt(editor);
    expect(during.text).toBe("标题nihao");
    expect(during.id).toBe(before.id);
    expect(during.id).not.toBe(slugMdLiveHeading("标题nihao"));
    expect(headingDom(editor)).toBe(el);

    mdLiveMarkComposing(false);
    typeChars(editor, "!");
    const after = headingAt(editor);
    expect(after.text).toBe("标题nihao!");
    expect(after.id).toBe(slugMdLiveHeading("标题nihao!"));
    expect(headingDom(editor)).toBe(el);
    await editor.destroy();
  });

  test("keeps paragraph text while composing", async () => {
    const editor = await createEditor("hello");
    caretAtEnd(editor);
    mdLiveMarkComposing(true);
    typeChars(editor, "nihao");
    expect(paragraphAt(editor)).toBe("hellonihao");
    mdLiveMarkComposing(false);
    await editor.destroy();
  });

  test("does not lift a typed task marker while composing", async () => {
    const editor = await createEditor("- item");
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const start = view.state.selection.$from.start();
      mdLiveMarkComposing(true);
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, start))
          .insertText("[x] "),
      );
    });
    const item = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let found: { text: string; taskMarker: unknown; checked: unknown } | null = null;
      view.state.doc.descendants((node) => {
        if (node.type.name !== "list_item") return;
        found = {
          text: node.textContent,
          taskMarker: node.attrs.taskMarker,
          checked: node.attrs.checked,
        };
        return false;
      });
      return found;
    });
    expect(item?.text.startsWith("[x] ")).toBe(true);
    expect(item?.taskMarker).toBeFalsy();
    mdLiveMarkComposing(false);
    await editor.destroy();
  });
});
