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
      const pathToUrl = buildResolvedModuleUrls(bundle.files, (url) => {
        this.blobUrls.push(url);
      });

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
 * Resolve a multi-file script graph to stable module URLs.
 * Iterates rewrite passes until sources converge (any nesting depth), then
 * prefers blob URLs for stack traces.
 */
function buildResolvedModuleUrls(
  files: Record<string, string>,
  trackBlob: (url: string) => void,
): Map<string, string> {
  let pathToUrl = new Map<string, string>();
  for (const [path, code] of Object.entries(files)) {
    const dataUrl = "data:text/javascript;charset=utf-8," + encodeURIComponent(code);
    pathToUrl.set(path, dataUrl);
    pathToUrl.set(path.replace(/^\.\//, ""), dataUrl);
  }

  // Converge: each pass rewrites imports against the previous pass's URLs so
  // A→B→C… chains fully resolve regardless of depth.
  let rewrittenByPath = new Map<string, string>();
  for (let pass = 0; pass < 64; pass++) {
    const nextUrls = new Map<string, string>();
    const nextRewritten = new Map<string, string>();
    let changed = false;
    for (const [path, code] of Object.entries(files)) {
      const rewritten = rewriteRelativeImports(code, path, pathToUrl);
      nextRewritten.set(path, rewritten);
      if (rewrittenByPath.get(path) !== rewritten) changed = true;
      const dataUrl =
        "data:text/javascript;charset=utf-8," + encodeURIComponent(rewritten);
      nextUrls.set(path, dataUrl);
      nextUrls.set(path.replace(/^\.\//, ""), dataUrl);
    }
    pathToUrl = nextUrls;
    rewrittenByPath = nextRewritten;
    if (!changed) break;
  }

  // Blob URLs for stack traces; rewrite once more so imports prefer blobs.
  for (const [path, rewritten] of rewrittenByPath) {
    const url = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
    trackBlob(url);
    pathToUrl.set(path, url);
    pathToUrl.set(path.replace(/^\.\//, ""), url);
  }

  // Final rewrite of each module so imports point at blob URLs, not data: chains.
  for (const [path, code] of Object.entries(files)) {
    const rewritten = rewriteRelativeImports(code, path, pathToUrl);
    const url = URL.createObjectURL(new Blob([rewritten], { type: "text/javascript" }));
    trackBlob(url);
    pathToUrl.set(path, url);
    pathToUrl.set(path.replace(/^\.\//, ""), url);
  }

  return pathToUrl;
}

/**
 * Rewrite relative module specifiers to absolute data/blob URLs.
 * Skips string / template / comment regions so ordinary source text is unchanged.
 */
export function rewriteRelativeImports(
  code: string,
  fromPath: string,
  pathToUrl: Map<string, string>,
): string {
  const replaceSpec = (quote: string, rel: string) => {
    const resolved = resolveRelative(fromPath, rel);
    const url =
      pathToUrl.get(resolved) ?? pathToUrl.get(resolved.replace(/^\.\//, ""));
    if (!url) return null;
    return `${quote}${url}${quote}`;
  };

  let out = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i]!;

    // Line comment
    if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const slice = end === -1 ? code.slice(i) : code.slice(i, end + 1);
      out += slice;
      i += slice.length;
      continue;
    }

    // Block comment
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const slice = end === -1 ? code.slice(i) : code.slice(i, end + 2);
      out += slice;
      i += slice.length;
      continue;
    }

    // String or template literal — copy whole lexeme (no import rewrite inside).
    if (ch === "'" || ch === '"' || ch === "`") {
      const end = scanStringLike(code, i);
      out += code.slice(i, end);
      i = end;
      continue;
    }

    const rest = code.slice(i);

    // export … from './x'  /  from './x'
    const fromMatch = rest.match(/^from\s*(['"])(\.[^'"]+)\1/);
    if (fromMatch && isKeywordBoundary(code, i, "from")) {
      const replaced = replaceSpec(fromMatch[1]!, fromMatch[2]!);
      if (replaced) {
        out += `from ${replaced}`;
        i += fromMatch[0].length;
        continue;
      }
    }

    // import('./x')
    const dynMatch = rest.match(/^import\s*\(\s*(['"])(\.[^'"]+)\1\s*\)/);
    if (dynMatch && isKeywordBoundary(code, i, "import")) {
      const replaced = replaceSpec(dynMatch[1]!, dynMatch[2]!);
      if (replaced) {
        out += `import(${replaced})`;
        i += dynMatch[0].length;
        continue;
      }
    }

    // side-effect import './x' only (not import x from / import {)
    const sideMatch = rest.match(/^import\s*(['"])(\.[^'"]+)\1/);
    if (
      sideMatch &&
      isKeywordBoundary(code, i, "import") &&
      /^\s*['"]/.test(code.slice(i + "import".length))
    ) {
      const replaced = replaceSpec(sideMatch[1]!, sideMatch[2]!);
      if (replaced) {
        out += `import ${replaced}`;
        i += sideMatch[0].length;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return out;
}

/** End index (exclusive) of a JS string or template starting at `start`. */
function scanStringLike(code: string, start: number): number {
  const quote = code[start]!;
  let j = start + 1;
  while (j < code.length) {
    const c = code[j]!;
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (quote === "`" && c === "$" && code[j + 1] === "{") {
      // Skip ${…} with nested string awareness
      j += 2;
      let depth = 1;
      while (j < code.length && depth > 0) {
        const inner = code[j]!;
        if (inner === "'" || inner === '"' || inner === "`") {
          j = scanStringLike(code, j);
          continue;
        }
        if (inner === "/" && code[j + 1] === "/") {
          const nl = code.indexOf("\n", j);
          j = nl === -1 ? code.length : nl + 1;
          continue;
        }
        if (inner === "/" && code[j + 1] === "*") {
          const end = code.indexOf("*/", j + 2);
          j = end === -1 ? code.length : end + 2;
          continue;
        }
        if (inner === "{") depth++;
        else if (inner === "}") depth--;
        j++;
      }
      continue;
    }
    if (c === quote) {
      return j + 1;
    }
    j++;
  }
  return code.length;
}

function isKeywordBoundary(code: string, index: number, keyword: string): boolean {
  if (!code.startsWith(keyword, index)) return false;
  const before = index === 0 ? "" : code[index - 1]!;
  if (/[A-Za-z0-9_$]/.test(before)) return false;
  return true;
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
