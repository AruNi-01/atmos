import { afterEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { GitFileBlameResponse } from "@/api/ws-api-types";
import type { GitBlameHost, GitBlameStrings } from "@/shared/lib/codemirror-git-blame";

mock.module("@workspace/ui", () => ({
  Avatar: (props: { children?: unknown }) => props.children,
  AvatarFallback: (props: { children?: unknown }) => props.children,
  Button: (props: { children?: unknown }) => props.children,
  Tooltip: (props: { children?: unknown }) => props.children,
  TooltipContent: (props: { children?: unknown }) => props.children,
  TooltipProvider: (props: { children?: unknown }) => props.children,
  TooltipTrigger: (props: { children?: unknown }) => props.children,
  Popover: (props: { children?: unknown }) => props.children,
  PopoverAnchor: (props: { children?: unknown }) => props.children,
  PopoverContent: () => null,
}));

const { createGitBlameExtensions } = await import("@/shared/lib/codemirror-git-blame");

const strings: GitBlameStrings = {
  notCommittedYet: "Not committed yet",
  filesChanged: (count) => `${count} files changed`,
  insertions: (count) => `+${count}`,
  deletions: (count) => `-${count}`,
  copyHash: "Copy commit hash",
  copied: "Copied",
  openCommit: "Open commit",
  relativeTime: () => "1 minute ago",
  when: () => "1 minute ago (2026-03-21 12:32:12)",
};

function blameFor(subject: string, hash: string): GitFileBlameResponse {
  return {
    file_path: "a.ts",
    blob_id: "blob",
    kind: "ok",
    ranges: [{ start_line: 1, end_line: 1, commit_hash: hash }],
    commits: {
      [hash]: {
        hash,
        short_hash: hash.slice(0, 7),
        author_name: "Ada",
        author_email: "ada@example.com",
        timestamp: 1_700_000_000,
        subject,
      },
    },
  };
}

function host(subject: string, hash: string): GitBlameHost {
  return {
    blame: blameFor(subject, hash),
    blamedDoc: "hello\n",
    fetchDetail: async () => null,
    strings,
  };
}

function installDom() {
  const win = new Window({ url: "https://atmos.local/" });
  const g = globalThis as typeof globalThis & {
    window: unknown;
    document: Document;
  };
  g.window = win;
  g.document = win.document as unknown as Document;
  Object.assign(g, {
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    Text: win.Text,
    DocumentFragment: win.DocumentFragment,
    MutationObserver: win.MutationObserver,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  });
  return win;
}

describe("APP-074 blame EOL widget follows host facet", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  test("host-only reconfigure updates the current-line widget without moving the caret", () => {
    const win = installDom();
    const parent = win.document.createElement("div");
    win.document.body.appendChild(parent);

    const blameCompartment = new Compartment();
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "hello\n",
        extensions: [blameCompartment.of(createGitBlameExtensions(host("first subject", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")))],
      }),
    });

    const beforeHead = view.state.selection.main.head;
    const beforeDoc = view.state.doc.toString();
    const first = parent.querySelector(".cm-git-blame-eol")?.textContent ?? "";
    expect(first).toContain("first subject");
    expect(first).not.toContain("second subject");

    view.dispatch({
      effects: blameCompartment.reconfigure(
        createGitBlameExtensions(host("second subject", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")),
      ),
    });

    expect(view.state.selection.main.head).toBe(beforeHead);
    expect(view.state.doc.toString()).toBe(beforeDoc);
    const second = parent.querySelector(".cm-git-blame-eol")?.textContent ?? "";
    expect(second).toContain("second subject");
    expect(second).not.toContain("first subject");

    view.destroy();
  });
});
