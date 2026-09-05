export type MarkdownFindQuery = {
  search: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
};

export type MarkdownFindHit = {
  startNode: Text;
  startOffset: number;
  endNode: Text;
  endOffset: number;
};

type TextSpan = {
  node: Text;
  start: number;
  end: number;
};

export type MarkdownFindPattern = {
  pattern: RegExp | null;
  invalid: boolean;
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const BLOCK_TAGS = new Set([
  "ARTICLE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileMarkdownFindPattern(
  query: MarkdownFindQuery,
): MarkdownFindPattern {
  const raw = query.search;
  if (!raw) return { pattern: null, invalid: false };

  try {
    let source = query.regexp ? raw : escapeRegExp(raw);
    if (query.wholeWord) {
      source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
    }
    const flags = query.caseSensitive ? "gu" : "giu";
    return { pattern: new RegExp(source, flags), invalid: false };
  } catch {
    return { pattern: null, invalid: true };
  }
}

function shouldSkipSearchNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest("[data-markdown-find-panel]")) return true;
  if (parent.closest("[data-markdown-find-highlight]")) return true;
  if (parent.closest("[data-markdown-toc]")) return true;
  return !node.textContent;
}

export function collectMarkdownFindTextNodes(root: ParentNode): Text[] {
  return collectMarkdownFindStream(root).spans.map((span) => span.node);
}

function collectMarkdownFindStream(root: ParentNode): {
  text: string;
  spans: TextSpan[];
  separators: number[];
} {
  let text = "";
  const spans: TextSpan[] = [];
  const separators: number[] = [];
  let pendingBlockBreak = false;
  let pendingSoftBreak = false;

  const recordExistingNewlineBoundary = () => {
    const offset = text.length - 1;
    if (separators[separators.length - 1] !== offset) separators.push(offset);
  };

  const markBlockBoundary = () => {
    if (text.length === 0) return;
    pendingSoftBreak = false;
    if (text.endsWith("\n")) {
      recordExistingNewlineBoundary();
      pendingBlockBreak = false;
      return;
    }
    pendingBlockBreak = true;
  };

  const markSoftBreak = () => {
    if (text.length === 0 || text.endsWith("\n") || pendingBlockBreak) return;
    pendingSoftBreak = true;
  };

  const flushBreaks = () => {
    if (pendingBlockBreak) {
      separators.push(text.length);
      text += "\n";
      pendingBlockBreak = false;
      pendingSoftBreak = false;
      return;
    }
    if (!pendingSoftBreak) return;
    pendingSoftBreak = false;
    if (!text.endsWith("\n")) text += "\n";
  };

  const visit = (node: ChildNode) => {
    if (node.nodeName === "#text") {
      const textNode = node as Text;
      if (shouldSkipSearchNode(textNode)) return;
      flushBreaks();
      const chunk = textNode.textContent ?? "";
      const start = text.length;
      text += chunk;
      spans.push({ node: textNode, start, end: text.length });
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (SKIP_TAGS.has(element.tagName)) return;
    if (element.hasAttribute("data-markdown-find-panel")) return;
    if (element.hasAttribute("data-markdown-find-highlight")) return;
    if (element.hasAttribute("data-markdown-toc")) return;
    if (element.tagName === "BR" || element.tagName === "HR") {
      markSoftBreak();
      return;
    }
    const block = BLOCK_TAGS.has(element.tagName);
    if (block) markBlockBoundary();
    for (const child of Array.from(element.childNodes)) visit(child);
    if (block) markBlockBoundary();
  };

  for (const child of Array.from(root.childNodes)) visit(child);
  return { text, spans, separators };
}

function matchOverlapsSeparator(
  matchStart: number,
  matchEnd: number,
  separators: number[],
): boolean {
  let low = 0;
  let high = separators.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (separators[mid]! < matchStart) low = mid + 1;
    else high = mid;
  }
  return low < separators.length && separators[low]! < matchEnd;
}

function matchOverlapsText(
  matchStart: number,
  matchEnd: number,
  spans: TextSpan[],
): boolean {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (spans[mid]!.end <= matchStart) low = mid + 1;
    else high = mid;
  }
  return low < spans.length && spans[low]!.start < matchEnd;
}

function locateStart(spans: TextSpan[], offset: number): TextSpan & { local: number } {
  const first = spans[0]!;
  for (const span of spans) {
    if (offset < span.end) {
      return { ...span, local: Math.max(0, offset - span.start) };
    }
  }
  const last = spans[spans.length - 1] ?? first;
  return { ...last, local: last.end - last.start };
}

function locateEnd(spans: TextSpan[], offset: number): TextSpan & { local: number } {
  const first = spans[0]!;
  let last = first;
  for (const span of spans) {
    if (offset <= span.start) {
      return { ...last, local: last.end - last.start };
    }
    last = span;
    if (offset <= span.end) {
      return { ...span, local: offset - span.start };
    }
  }
  return { ...last, local: last.end - last.start };
}

export function findMarkdownHits(
  root: ParentNode,
  query: MarkdownFindQuery,
): { hits: MarkdownFindHit[]; invalid: boolean } {
  const { pattern, invalid } = compileMarkdownFindPattern(query);
  if (!pattern) return { hits: [], invalid };

  const { text, spans, separators } = collectMarkdownFindStream(root);
  if (spans.length === 0) return { hits: [], invalid: false };

  const hits: MarkdownFindHit[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      if (pattern.lastIndex > text.length) break;
      match = pattern.exec(text);
      continue;
    }
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (
      matchOverlapsSeparator(matchStart, matchEnd, separators) ||
      !matchOverlapsText(matchStart, matchEnd, spans)
    ) {
      match = pattern.exec(text);
      continue;
    }
    const start = locateStart(spans, matchStart);
    const end = locateEnd(spans, matchEnd);
    if (start.node === end.node && start.local >= end.local) {
      match = pattern.exec(text);
      continue;
    }
    hits.push({
      startNode: start.node,
      startOffset: start.local,
      endNode: end.node,
      endOffset: end.local,
    });
    match = pattern.exec(text);
  }
  return { hits, invalid: false };
}

export function markdownFindCounter(activeIndex: number, total: number): string {
  if (!total) return "";
  if (activeIndex < 0) return `0/${total}`;
  return `${activeIndex + 1}/${total}`;
}

export function scrollMarkdownFindHitIntoView(
  root: HTMLElement,
  hit: MarkdownFindHit,
): void {
  const range = root.ownerDocument.createRange();
  range.setStart(hit.startNode, hit.startOffset);
  range.setEnd(hit.endNode, hit.endOffset);
  const hitRect = range.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const pad = 48;
  if (
    hitRect.top >= rootRect.top + pad &&
    hitRect.bottom <= rootRect.bottom - pad
  ) {
    return;
  }
  const nextTop =
    root.scrollTop + (hitRect.top - rootRect.top) - root.clientHeight / 3;
  root.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
}
