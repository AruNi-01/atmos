/**
 * Document script host — tldraw-offline style durable scripts.
 *
 * ```js
 * export default function ({ editor, helpers, signal }) {
 *   // click handlers, tick loops, shape updates…
 * }
 * ```
 *
 * Multi-file: list sources under `files`. Relative imports from the entry
 * module are rewritten to blob URLs of sibling files. Prefer a single
 * `main.js` for simple boards.
 */
import type { Editor } from "tldraw";

import {
  createDocumentScriptHelpers,
  type DocumentScriptHelpers,
} from "./document-script-helpers";

export type CanvasDocumentScriptBundle = {
  entry: string;
  files: Record<string, string>;
};

export type DocumentScriptStatus = {
  state: "idle" | "running" | "error" | "stopped";
  entry: string | null;
  error: string | null;
  startedAt: number | null;
};

export type DocumentScriptContext = {
  editor: Editor;
  helpers: DocumentScriptHelpers;
  signal: AbortSignal;
};

type ScriptModule = {
  default?: (ctx: DocumentScriptContext) => void | Promise<void>;
};

export class DocumentScriptHost {
  private editor: Editor | null = null;
  private abort: AbortController | null = null;
  private blobUrls: string[] = [];
  private status: DocumentScriptStatus = {
    state: "idle",
    entry: null,
    error: null,
    startedAt: null,
  };
  private listeners = new Set<(s: DocumentScriptStatus) => void>();

  getStatus(): DocumentScriptStatus {
    return { ...this.status };
  }

  subscribe(listener: (s: DocumentScriptStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snap = this.getStatus();
    for (const l of this.listeners) l(snap);
  }

  private setStatus(partial: Partial<DocumentScriptStatus>) {
    this.status = { ...this.status, ...partial };
    this.emit();
  }

  setEditor(editor: Editor | null) {
    if (this.editor === editor) return;
    void this.stop();
    this.editor = editor;
  }

  async stop() {
    if (this.abort) {
      this.abort.abort();
      this.abort = null;
    }
    for (const url of this.blobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.blobUrls = [];
    if (this.status.state === "running") {
      this.setStatus({ state: "stopped", error: null });
    }
  }

  async start(bundle: CanvasDocumentScriptBundle | null | undefined) {
    await this.stop();
    const editor = this.editor;
    if (!editor || !bundle?.files || Object.keys(bundle.files).length === 0) {
      this.setStatus({
        state: "idle",
        entry: null,
        error: null,
        startedAt: null,
      });
      return;
    }

    const entry = (bundle.entry || "main.js").trim() || "main.js";
    const source = bundle.files[entry];
    if (typeof source !== "string") {
      this.setStatus({
        state: "error",
        entry,
        error: `Script entry "${entry}" missing from files`,
        startedAt: null,
      });
      return;
    }

    this.abort = new AbortController();
    const signal = this.abort.signal;
    const helpers = createDocumentScriptHelpers(editor);

    try {
      // data: URLs so every file has a stable absolute import target before rewrite.
      const pathToDataUrl = new Map<string, string>();
      for (const [path, code] of Object.entries(bundle.files)) {
        const dataUrl =
          "data:text/javascript;charset=utf-8," + encodeURIComponent(code);
        pathToDataUrl.set(path, dataUrl);
        pathToDataUrl.set(path.replace(/^\.\//, ""), dataUrl);
      }

      // Rewrite all modules so relative imports resolve, then re-encode entry.
      const rewrittenEntry = rewriteRelativeImports(source, entry, pathToDataUrl);
      // Also rewrite non-entry modules into blob URLs for cleaner stack traces.
      for (const [path, code] of Object.entries(bundle.files)) {
        if (path === entry) continue;
        const rewritten = rewriteRelativeImports(code, path, pathToDataUrl);
        const url = URL.createObjectURL(
          new Blob([rewritten], { type: "text/javascript" }),
        );
        this.blobUrls.push(url);
        pathToDataUrl.set(path, url);
        pathToDataUrl.set(path.replace(/^\.\//, ""), url);
      }
      const entryFinal = rewriteRelativeImports(source, entry, pathToDataUrl);
      const entryUrl = URL.createObjectURL(
        new Blob([entryFinal.length ? entryFinal : rewrittenEntry], {
          type: "text/javascript",
        }),
      );
      this.blobUrls.push(entryUrl);

      this.setStatus({
        state: "running",
        entry,
        error: null,
        startedAt: Date.now(),
      });

      const mod = (await import(/* webpackIgnore: true */ entryUrl)) as ScriptModule;
      if (signal.aborted) return;

      const run = mod.default;
      if (typeof run !== "function") {
        throw new Error(
          "Document script must default-export a function: export default function ({ editor, helpers, signal }) {}",
        );
      }

      await run({ editor, helpers, signal });
    } catch (err) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error("[document-script]", err);
      this.setStatus({
        state: "error",
        entry,
        error: message,
        startedAt: this.status.startedAt,
      });
    }
  }
}

function rewriteRelativeImports(
  code: string,
  fromPath: string,
  pathToUrl: Map<string, string>,
): string {
  return code.replace(
    /(\bfrom\s+|import\s*\(\s*)(['"])(\.[^'"]+)\2/g,
    (full, prefix: string, quote: string, rel: string) => {
      const resolved = resolveRelative(fromPath, rel);
      const url =
        pathToUrl.get(resolved) ?? pathToUrl.get(resolved.replace(/^\.\//, ""));
      if (!url) return full;
      return `${prefix}${quote}${url}${quote}`;
    },
  );
}

function resolveRelative(fromPath: string, rel: string): string {
  const fromParts = fromPath.split("/").slice(0, -1);
  const relParts = rel.split("/");
  for (const part of relParts) {
    if (part === "." || part === "") continue;
    if (part === "..") fromParts.pop();
    else fromParts.push(part);
  }
  return fromParts.join("/");
}

let sharedHost: DocumentScriptHost | null = null;

export function getDocumentScriptHost(): DocumentScriptHost {
  if (!sharedHost) sharedHost = new DocumentScriptHost();
  return sharedHost;
}

/** One-shot exec (offline /exec equivalent) against the live editor. */
export async function runDocumentScriptExec(
  editor: Editor,
  code: string,
): Promise<unknown> {
  const helpers = createDocumentScriptHelpers(editor);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;
  // code is wrapped like offline: top-level await ok
  const fn = new AsyncFunction("editor", "helpers", code);
  return fn(editor, helpers);
}
