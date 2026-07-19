/**
 * Document script host — durable per-document scripts.
 *
 * ```js
 * export default function ({ editor, helpers, signal }) {
 *   // click handlers, tick loops, shape updates…
 * }
 * ```
 *
 * Multi-file: list sources under `files`. Relative imports from the entry
 * module are rewritten to blob/data URLs of sibling files. Prefer a single
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
      // Multipass rewrite so nested relative imports resolve to rewritten modules,
      // not raw sources (A → B → C).
      let pathToUrl = new Map<string, string>();
      for (const [path, code] of Object.entries(bundle.files)) {
        const dataUrl =
          "data:text/javascript;charset=utf-8," + encodeURIComponent(code);
        pathToUrl.set(path, dataUrl);
        pathToUrl.set(path.replace(/^\.\//, ""), dataUrl);
      }

      for (let pass = 0; pass < 4; pass++) {
        const next = new Map<string, string>();
        for (const [path, code] of Object.entries(bundle.files)) {
          const rewritten = rewriteRelativeImports(code, path, pathToUrl);
          const dataUrl =
            "data:text/javascript;charset=utf-8," + encodeURIComponent(rewritten);
          next.set(path, dataUrl);
          next.set(path.replace(/^\.\//, ""), dataUrl);
        }
        pathToUrl = next;
      }

      // Prefer blob URLs for stack traces; rewrite once more against final map.
      for (const [path, code] of Object.entries(bundle.files)) {
        const rewritten = rewriteRelativeImports(code, path, pathToUrl);
        const url = URL.createObjectURL(
          new Blob([rewritten], { type: "text/javascript" }),
        );
        this.blobUrls.push(url);
        pathToUrl.set(path, url);
        pathToUrl.set(path.replace(/^\.\//, ""), url);
      }

      const entryFinal = rewriteRelativeImports(source, entry, pathToUrl);
      const entryUrl = URL.createObjectURL(
        new Blob([entryFinal], { type: "text/javascript" }),
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

      // Do not await a long-lived async default export — scripts mount listeners
      // and stay alive until signal abort. Surface late rejections as errors.
      void Promise.resolve(run({ editor, helpers, signal })).catch((err) => {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error("[document-script]", err);
        this.setStatus({
          state: "error",
          entry,
          error: message,
          startedAt: this.status.startedAt,
        });
      });
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

/**
 * Rewrite relative module specifiers to absolute data/blob URLs.
 * Covers: `from "…"`, `import("…")`, side-effect `import "…"`,
 * and `export … from "…"`.
 */
export function rewriteRelativeImports(
  code: string,
  fromPath: string,
  pathToUrl: Map<string, string>,
): string {
  const replaceSpec = (quote: string, rel: string, prefix: string, suffix = "") => {
    const resolved = resolveRelative(fromPath, rel);
    const url =
      pathToUrl.get(resolved) ?? pathToUrl.get(resolved.replace(/^\.\//, ""));
    if (!url) return `${prefix}${quote}${rel}${quote}${suffix}`;
    return `${prefix}${quote}${url}${quote}${suffix}`;
  };

  // export … from './x'  /  from './x'
  let out = code.replace(
    /(\bfrom\s+)(['"])(\.[^'"]+)\2/g,
    (_full, prefix: string, quote: string, rel: string) =>
      replaceSpec(quote, rel, prefix),
  );
  // import('./x')
  out = out.replace(
    /(\bimport\s*\(\s*)(['"])(\.[^'"]+)\2(\s*\))/g,
    (_full, prefix: string, quote: string, rel: string, suffix: string) =>
      replaceSpec(quote, rel, prefix, suffix),
  );
  // side-effect: import './x'
  out = out.replace(
    /(\bimport\s+)(['"])(\.[^'"]+)\2/g,
    (_full, prefix: string, quote: string, rel: string) =>
      replaceSpec(quote, rel, prefix),
  );
  return out;
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

/** One-shot exec against the live editor. */
export async function runDocumentScriptExec(
  editor: Editor,
  code: string,
): Promise<unknown> {
  const helpers = createDocumentScriptHelpers(editor);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;
  // code is wrapped so top-level await works
  const fn = new AsyncFunction("editor", "helpers", code);
  return fn(editor, helpers);
}
