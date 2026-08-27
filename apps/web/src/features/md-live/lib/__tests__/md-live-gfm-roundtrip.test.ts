import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { createMdLiveOnChangeGate } from "../md-live-onchange-gate";

const SOURCE = `# Hi

A paragraph.

- item
`;

let previousWindow: PropertyDescriptor | undefined;
let previousDocument: PropertyDescriptor | undefined;

function installDom(): Window {
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
  return win;
}

function restoreDom(): void {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else delete (globalThis as { window?: unknown }).window;
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else delete (globalThis as { document?: unknown }).document;
}

describe("md-live GFM onChange gate with Milkdown", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("no-edit serialize does not dirty; first real edit emits", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const committed: string[] = [];
    const gate = createMdLiveOnChangeGate(SOURCE);

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, SOURCE);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          const next = gate(markdown);
          if (next == null) return;
          committed.push(next);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener);

    await editor.create();
    // Listener does not fire on init, so a no-edit open is not dirty even if
    // serialize normalizes GFM (Milkdown writes `*` for `-` lists).
    expect(committed).toEqual([]);
    const serialized = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      return ctx.get(serializerCtx)(view.state.doc);
    });
    expect(serialized.includes("item")).toBe(true);

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText(" edited", 1));
    });
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(committed.length).toBeGreaterThan(0);
    expect(committed[0]).not.toBe(SOURCE);
    expect(committed[0]).not.toBe(serialized);
    await editor.destroy();
  });
});
