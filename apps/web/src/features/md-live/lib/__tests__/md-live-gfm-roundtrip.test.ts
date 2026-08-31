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
import {
  applyMdLiveRemarkConfig,
  createMdLiveOnChangeGate,
  formatMdLiveSerializedMarkdown,
  mdLiveTaskListPlugins,
  mdLiveTogglePlugins,
} from "@atmos/md-live/ui";

const SOURCE = `# Hi

A paragraph.

- item
- second
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

async function createLiveSerializer(source: string, committed: string[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const gate = createMdLiveOnChangeGate(source);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, source);
      applyMdLiveRemarkConfig(ctx);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        const next = gate(formatMdLiveSerializedMarkdown(markdown));
        if (next == null) return;
        committed.push(next);
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(mdLiveTaskListPlugins)
    .use(mdLiveTogglePlugins)
    .use(listener);

  await editor.create();
  const snapshot = editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    return formatMdLiveSerializedMarkdown(ctx.get(serializerCtx)(view.state.doc));
  });
  gate(snapshot);
  gate.arm();
  return { editor, snapshot };
}

describe("md-live GFM onChange gate with Milkdown", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("no-edit serialize does not dirty; first real edit emits", async () => {
    const committed: string[] = [];
    const { editor, snapshot } = await createLiveSerializer(SOURCE, committed);
    expect(committed).toEqual([]);
    expect(snapshot).toContain("- item");
    expect(snapshot).toContain("- second");
    expect(snapshot).not.toContain("* item");
    expect(snapshot).not.toMatch(/- item\n\n-/);

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText(" edited", 1));
    });
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(committed.length).toBeGreaterThan(0);
    expect(committed[0]).not.toBe(SOURCE);
    expect(committed[0]).not.toBe(snapshot);
    await editor.destroy();
  });

  test("compact tables and empty cells do not rewrite on load", async () => {
    const source = `# Agent

A paragraph.

| 状态 | 含义 |
| --- | --- |
| \`idle\` | Agent 空闲 |
| \`running\` | Agent 正在处理任务 |

## Next
`;
    const committed: string[] = [];
    const { editor, snapshot } = await createLiveSerializer(source, committed);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(committed).toEqual([]);
    expect(snapshot).not.toMatch(/<br\s*\/?>/i);
    expect(snapshot).not.toMatch(/[^\n|]-{4,}/);
    expect(snapshot).toContain("| 状态 | 含义 |");
    expect(snapshot).toContain("| --- | --- |");
    expect(snapshot).toContain("| `idle` | Agent 空闲 |");
    await editor.destroy();
  });

  test("empty table cells serialize without br sentinels", async () => {
    const source = `| 状态 | 含义 |
| --- | --- |
| \`idle\` |  |
|  | Agent 空闲 |
`;
    const committed: string[] = [];
    const { editor, snapshot } = await createLiveSerializer(source, committed);
    expect(committed).toEqual([]);
    expect(snapshot).not.toMatch(/<br\s*\/?>/i);
    expect(snapshot).toContain("| `idle` |");
    expect(snapshot).toContain("| --- | --- |");
    await editor.destroy();
  });

  test("parses and serializes ATX headings through h6", async () => {
    const source = `# One

##### Five

###### Six
`;
    const committed: string[] = [];
    const { editor, snapshot } = await createLiveSerializer(source, committed);
    const levels: number[] = [];
    editor.action((ctx) => {
      ctx.get(editorViewCtx).state.doc.descendants((node) => {
        if (node.type.name === "heading") levels.push(Number(node.attrs.level));
      });
    });
    expect(levels).toEqual([1, 5, 6]);
    expect(snapshot).toContain("##### Five");
    expect(snapshot).toContain("###### Six");
    expect(committed).toEqual([]);
    await editor.destroy();
  });

  test("details/summary serializes as compact html without br sentinels", async () => {
    const source = `<details>
<summary>hello</summary>

哦好

你好
</details>
`;
    const committed: string[] = [];
    const { editor, snapshot } = await createLiveSerializer(source, committed);
    expect(committed).toEqual([]);
    expect(snapshot).toContain("<details>");
    expect(snapshot).toContain("<summary>hello</summary>");
    expect(snapshot).toContain("哦好");
    expect(snapshot).toContain("你好");
    expect(snapshot).not.toMatch(/<br\s*\/?>/i);
    await editor.destroy();
  });
});
