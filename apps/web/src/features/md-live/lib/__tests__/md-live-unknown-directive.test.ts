import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import {
  applyMdLiveRemarkConfig,
  formatMdLiveSerializedMarkdown,
} from "@atmos/md-live/ui";
import {
  mdLiveEmbedBlock,
  mdLiveEmbedInline,
  mdLiveRemarkDirective,
} from "../md-live-embed-nodes";

const USER_PROSE = `这里已经看出关键点了:每种 tmux 操作都 \`spawn\` 一个新的 \`tmux\` 进程(\`Command::new\`),而且多次操作(\`capture_pane_page\` 内部要跑 4、5 次 tmux)互不复用。`;

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

async function createEmbedEditor(source: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, source);
      applyMdLiveRemarkConfig(ctx);
    })
    .use(commonmark)
    .use(gfm)
    .use(mdLiveRemarkDirective)
    .use(mdLiveEmbedBlock)
    .use(mdLiveEmbedInline);

  await editor.create();
  const snapshot = editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    return {
      markdown: formatMdLiveSerializedMarkdown(ctx.get(serializerCtx)(view.state.doc)),
      types: (() => {
        const names: string[] = [];
        view.state.doc.descendants((node) => {
          names.push(node.type.name);
        });
        return names;
      })(),
    };
  });
  return { editor, ...snapshot };
}

describe("md-live unknown directive parse", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    restoreDom();
  });

  test("CJK colon prose does not throw Milkdown parser mismatch", async () => {
    const { editor, markdown, types } = await createEmbedEditor(USER_PROSE);
    expect(types).not.toContain("mdLiveEmbedInline");
    expect(types).not.toContain("mdLiveEmbedBlock");
    expect(markdown).toContain(":每种");
    expect(markdown).toContain("Command::new");
    await editor.destroy();
  });

  test("keeps :md-live inline embeds while restoring other :names", async () => {
    const source = `A file :md-live[auth.ts]{kind=file layout=inline path=src/auth.ts} and 了:每种 tmux.
`;
    const { editor, markdown, types } = await createEmbedEditor(source);
    expect(types).toContain("mdLiveEmbedInline");
    expect(markdown).toContain(":md-live[auth.ts]");
    expect(markdown).toContain(":每种");
    await editor.destroy();
  });

  test("parses other common markdown that looks like directives or references", async () => {
    const fixtures: Array<[string, string]> = [
      ["time", "Meet at 12:30 in room 16:9."],
      ["port url", "Open http://localhost:3000 now."],
      ["mailto", "Email mailto:user@example.com please."],
      ["windows path", "Path C:\\Users\\aarynlu\\repo"],
      ["emoji shortcode", "Hello :smile: and :每种:"],
      ["double colon ident", "Use Command::new and foo::bar."],
      ["inline cite", "See :cite[Smith]{year=2020} for details."],
      ["leaf youtube", "::youtube[Clip]{url=https://youtu.be/a}\n"],
      ["container note", ":::note\nHello body\n:::\n"],
      ["unresolved full ref", "See [the spec][missing-ref] today."],
      ["unresolved collapsed ref", "See [missing][] today."],
      ["shortcut wiki", "Open [[wiki-page]] in the sidebar."],
      ["image ref missing", "Here is ![alt][no-img]."],
      ["resolved ref", "See [the spec][ok].\n\n[ok]: https://example.com\n"],
      ["unused definition", "Hello.\n\n[unused]: https://example.com/x\n"],
      ["footnote", "A note.[^1]\n\n[^1]: Footnote body.\n"],
      ["heading colon", "## 后续优化:\n\nNext.\n"],
      ["json braces", "Config {\"a\":1} and {#id}."],
      ["autolink", "Visit <https://example.com/path> please."],
      ["strikethrough", "This is ~~old~~ text."],
      ["task list", "- [ ] todo\n- [x] done\n"],
      ["html comment", "Before\n\n<!-- hidden -->\n\nAfter\n"],
    ];
    const failures: string[] = [];
    const snippets: Record<string, string> = {
      time: "12:30",
      "port url": "localhost:3000",
      mailto: "mailto:user@example.com",
      "emoji shortcode": ":smile:",
      "double colon ident": "Command::new",
      "inline cite": ":cite[Smith]",
      "leaf youtube": "::youtube",
      "container note": ":::note",
      "unresolved full ref": "[the spec][missing-ref]",
      "shortcut wiki": "[[wiki-page]]",
      "image ref missing": "![alt][no-img]",
      "resolved ref": "https://example.com",
      "heading colon": "后续优化:",
    };
    for (const [name, source] of fixtures) {
      try {
        const { editor, markdown } = await createEmbedEditor(source);
        if (!markdown.trim()) failures.push(`${name}: empty serialize`);
        const snippet = snippets[name];
        const plain = markdown.replace(/\\/g, "");
        if (snippet && !plain.includes(snippet)) {
          failures.push(`${name}: missing ${snippet} in ${JSON.stringify(markdown)}`);
        }
        await editor.destroy();
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
