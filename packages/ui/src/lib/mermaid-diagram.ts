import type { MermaidWorkerRequest, MermaidWorkerResponse } from "./mermaid-diagram-worker-protocol";

export type MermaidDiagramTheme = "light" | "dark";

export type MermaidDiagramRecord = {
  svg: string;
  imageUrl: string;
  width: number;
  height: number;
};

export const MERMAID_DIAGRAM_CACHE_LIMIT = 40;
export const MERMAID_SCROLL_IDLE_MS = 200;
export const MERMAID_IDLE_TIMEOUT_MS = 1500;
export const MERMAID_VIEWPORT_MARGIN_PX = 48;
export const MERMAID_RENDERING_LABEL = "Rendering...";

const cache = new Map<string, MermaidDiagramRecord>();
const inflight = new Map<string, Promise<MermaidDiagramRecord>>();
let renderChain: Promise<void> = Promise.resolve();
let mermaidId = 0;

export function mermaidDiagramCacheKey(code: string, theme: MermaidDiagramTheme): string {
  return `${theme}\0${code}`;
}

export function parseMermaidSvgSize(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (viewBox) {
    const width = Number(viewBox[3]);
    const height = Number(viewBox[4]);
    if (width > 0 && height > 0) return { width, height };
  }
  const widthAttr = svg.match(/\swidth="([\d.]+)(?:px)?"/i);
  const heightAttr = svg.match(/\sheight="([\d.]+)(?:px)?"/i);
  const width = widthAttr ? Number(widthAttr[1]) : 0;
  const height = heightAttr ? Number(heightAttr[1]) : 0;
  if (width > 0 && height > 0) return { width, height };
  return { width: 800, height: 240 };
}

/** Worker shims can emit a hairline SVG; do not treat that as a successful preview. */
export function isPlausibleMermaidSvgSize(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width < 8 || height < 8) return false;
  if (width > 16_000 || height > 16_000) return false;
  const ratio = width / height;
  return ratio <= 24 && ratio >= 1 / 24;
}

export function estimateMermaidPlaceholderHeight(code: string): number {
  const lines = Math.max(1, code.split("\n").length);
  return Math.min(640, Math.max(160, 96 + lines * 18));
}

export function readMermaidDiagramCache(
  code: string,
  theme: MermaidDiagramTheme,
): MermaidDiagramRecord | null {
  const key = mermaidDiagramCacheKey(code, theme);
  const record = cache.get(key);
  if (!record) return null;
  if (!isPlausibleMermaidSvgSize(record.width, record.height)) {
    cache.delete(key);
    URL.revokeObjectURL(record.imageUrl);
    return null;
  }
  cache.delete(key);
  cache.set(key, record);
  return record;
}

export function clearMermaidDiagramCache(): void {
  for (const record of cache.values()) {
    URL.revokeObjectURL(record.imageUrl);
  }
  cache.clear();
  inflight.clear();
}

function rememberMermaidDiagram(key: string, record: MermaidDiagramRecord): MermaidDiagramRecord {
  if (cache.has(key)) {
    const previous = cache.get(key);
    if (previous && previous.imageUrl !== record.imageUrl) {
      URL.revokeObjectURL(previous.imageUrl);
    }
    cache.delete(key);
  }
  cache.set(key, record);
  while (cache.size > MERMAID_DIAGRAM_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    const dropped = cache.get(oldest);
    cache.delete(oldest);
    if (dropped) URL.revokeObjectURL(dropped.imageUrl);
  }
  return record;
}

function cleanupMermaidArtifacts(id: string): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`body > #${CSS.escape(id)}, body > #d${CSS.escape(id)}`).forEach((node) => {
    node.remove();
  });
}

function whenIdle(timeout = MERMAID_IDLE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout });
      return;
    }
    setTimeout(resolve, 16);
  });
}

export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}

function waitOnScrollParent(
  scrollParent: HTMLElement,
  quietMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let timer = window.setTimeout(finish, quietMs);
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, quietMs);
    };
    const onAbort = () => finish();
    function finish() {
      window.clearTimeout(timer);
      scrollParent.removeEventListener("scroll", onScroll);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function waitForScrollIdle(
  node: HTMLElement | null,
  quietMs = MERMAID_SCROLL_IDLE_MS,
  signal?: AbortSignal,
): Promise<void> {
  const scrollParent = findScrollParent(node);
  if (!scrollParent || signal?.aborted) return Promise.resolve();
  return waitOnScrollParent(scrollParent, quietMs, signal);
}

export function isElementIntersectingScrollParent(
  node: HTMLElement | null,
  margin = MERMAID_VIEWPORT_MARGIN_PX,
): boolean {
  if (!node) return false;
  const rect = node.getBoundingClientRect();
  const root = findScrollParent(node);
  const rootRect = root?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
  };
  return (
    rect.bottom >= rootRect.top - margin &&
    rect.top <= rootRect.bottom + margin &&
    rect.right >= rootRect.left - margin &&
    rect.left <= rootRect.right + margin
  );
}

export function waitForVisible(
  node: HTMLElement | null,
  signal?: AbortSignal,
  rootMargin = `${MERMAID_VIEWPORT_MARGIN_PX}px`,
): Promise<void> {
  if (!node || signal?.aborted) return Promise.resolve();
  if (typeof IntersectionObserver === "undefined") return Promise.resolve();
  if (isElementIntersectingScrollParent(node)) return Promise.resolve();
  const root = findScrollParent(node);
  return new Promise((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) finish();
      },
      { root, rootMargin, threshold: 0 },
    );
    const onAbort = () => finish();
    function finish() {
      observer.disconnect();
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    observer.observe(node);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForMermaidSlotReady(
  node: HTMLElement | null,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!node || signal?.aborted) return false;
  while (true) {
    if (signal?.aborted) return false;
    await waitForVisible(node, signal);
    if (signal?.aborted) return false;
    await waitForScrollIdle(node, MERMAID_SCROLL_IDLE_MS, signal);
    if (signal?.aborted) return false;
    if (isElementIntersectingScrollParent(node)) return true;
    if (!signal) return false;
  }
}

function enqueueRender<T>(work: () => Promise<T>): Promise<T> {
  const run = renderChain.then(work, work);
  renderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function svgBlobUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

type MermaidRenderer = {
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

let mermaidPluginPromise: Promise<typeof import("@streamdown/mermaid")> | null = null;
const mermaidByTheme = new Map<MermaidDiagramTheme, MermaidRenderer>();

let worker: Worker | null = null;
let workerUnavailable = false;
let workerJobId = 0;
const workerJobs = new Map<number, (response: MermaidWorkerResponse) => void>();

function createMermaidWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./mermaid-diagram.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<MermaidWorkerResponse>) => {
      const response = event.data;
      if (!response || typeof response.id !== "number") return;
      const finish = workerJobs.get(response.id);
      if (!finish) return;
      workerJobs.delete(response.id);
      finish(response);
    });
    worker.addEventListener("error", () => {
      workerUnavailable = true;
      for (const finish of workerJobs.values()) {
        finish({ id: -1, error: "Mermaid worker failed" });
      }
      workerJobs.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

function renderMermaidSvgInWorker(code: string, theme: MermaidDiagramTheme): Promise<string | null> {
  const target = createMermaidWorker();
  if (!target) return Promise.resolve(null);
  workerJobId += 1;
  const id = workerJobId;
  const request: MermaidWorkerRequest = { id, code, theme };
  return new Promise((resolve, reject) => {
    workerJobs.set(id, (response) => {
      if (response.svg) {
        resolve(response.svg);
        return;
      }
      reject(new Error(response.error || "Failed to render mermaid diagram"));
    });
    try {
      target.postMessage(request);
    } catch (error) {
      workerJobs.delete(id);
      workerUnavailable = true;
      reject(error);
    }
  });
}

async function getMermaid(theme: MermaidDiagramTheme) {
  const existing = mermaidByTheme.get(theme);
  if (existing) return existing;
  mermaidPluginPromise ??= import("@streamdown/mermaid");
  const { createMermaidPlugin } = await mermaidPluginPromise;
  const plugin = createMermaidPlugin({
    config: {
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
    },
  });
  const mermaid = plugin.getMermaid({
    theme: theme === "dark" ? "dark" : "default",
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: true },
  });
  mermaidByTheme.set(theme, mermaid);
  return mermaid;
}

async function renderMermaidSvgOnMain(code: string, theme: MermaidDiagramTheme): Promise<string> {
  const mermaid = await getMermaid(theme);
  mermaidId += 1;
  const id = `atmos-mermaid-${mermaidId}`;
  try {
    const { svg } = await mermaid.render(id, code);
    if (!svg || /syntax error/i.test(svg)) {
      throw new Error("Failed to render mermaid diagram");
    }
    return svg;
  } finally {
    cleanupMermaidArtifacts(id);
  }
}

async function renderMermaidSvg(code: string, theme: MermaidDiagramTheme): Promise<string> {
  if (!workerUnavailable) {
    try {
      const svg = await renderMermaidSvgInWorker(code, theme);
      if (svg) {
        const size = parseMermaidSvgSize(svg);
        if (isPlausibleMermaidSvgSize(size.width, size.height)) return svg;
      }
    } catch (error) {
      if (worker && !workerUnavailable) throw error;
    }
  }
  await whenIdle();
  return renderMermaidSvgOnMain(code, theme);
}

export function renderMermaidDiagram(
  code: string,
  theme: MermaidDiagramTheme,
): Promise<MermaidDiagramRecord> {
  const key = mermaidDiagramCacheKey(code, theme);
  const cached = readMermaidDiagramCache(code, theme);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;

  const work = enqueueRender(async () => {
    const again = cache.get(key);
    if (again && isPlausibleMermaidSvgSize(again.width, again.height)) return again;
    const svg = await renderMermaidSvg(code, theme);
    const size = parseMermaidSvgSize(svg);
    const record: MermaidDiagramRecord = {
      svg,
      imageUrl: svgBlobUrl(svg),
      width: size.width,
      height: size.height,
    };
    return rememberMermaidDiagram(key, record);
  });

  inflight.set(key, work);
  work.finally(() => {
    if (inflight.get(key) === work) inflight.delete(key);
  });
  return work;
}
