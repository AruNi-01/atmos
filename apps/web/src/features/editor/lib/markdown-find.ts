export type MarkdownFindQuery = {
  search: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
};

export type MarkdownFindHit = {
  node: Text;
  start: number;
  end: number;
};

export type MarkdownFindPattern = {
  pattern: RegExp | null;
  invalid: boolean;
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

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
  const nodes: Text[] = [];
  const stack: ChildNode[] = [];
  for (let i = root.childNodes.length - 1; i >= 0; i -= 1) {
    stack.push(root.childNodes[i]!);
  }
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeName === "#text") {
      const text = node as Text;
      if (!shouldSkipSearchNode(text)) nodes.push(text);
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (SKIP_TAGS.has(element.tagName)) continue;
    if (element.hasAttribute("data-markdown-find-panel")) continue;
    if (element.hasAttribute("data-markdown-find-highlight")) continue;
    if (element.hasAttribute("data-markdown-toc")) continue;
    for (let i = element.childNodes.length - 1; i >= 0; i -= 1) {
      stack.push(element.childNodes[i]!);
    }
  }
  return nodes;
}

export function findMarkdownHits(
  root: ParentNode,
  query: MarkdownFindQuery,
): { hits: MarkdownFindHit[]; invalid: boolean } {
  const { pattern, invalid } = compileMarkdownFindPattern(query);
  if (!pattern) return { hits: [], invalid };

  const hits: MarkdownFindHit[] = [];
  for (const node of collectMarkdownFindTextNodes(root)) {
    const text = node.textContent ?? "";
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        if (pattern.lastIndex > text.length) break;
        match = pattern.exec(text);
        continue;
      }
      hits.push({
        node,
        start: match.index,
        end: match.index + match[0].length,
      });
      match = pattern.exec(text);
    }
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
  range.setStart(hit.node, hit.start);
  range.setEnd(hit.node, hit.end);
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
