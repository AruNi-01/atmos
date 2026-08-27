type Mdast = {
  type: string;
  value?: string;
  children?: Mdast[];
};

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Pull visible characters out of an HTML fragment.
 * Tags are skipped with a linear scan (unclosed `<...` is dropped), then
 * leftover `<` / `>` after entity decoding are stripped so the result cannot
 * re-form markup. Summary text is plain text, never HTML.
 */
export function htmlToPlainText(html: string): string {
  let out = "";
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open < 0) {
      out += html.slice(index);
      break;
    }
    out += html.slice(index, open);
    const close = html.indexOf(">", open + 1);
    if (close < 0) break;
    index = close + 1;
  }
  return decodeHtml(out).replace(/[<>]/g, "").trim();
}

function htmlBlob(node: Mdast): string | null {
  if (node.type === "html" && typeof node.value === "string") return node.value;
  if (
    node.type === "paragraph"
    && node.children?.length === 1
    && node.children[0]?.type === "html"
    && typeof node.children[0].value === "string"
  ) {
    return node.children[0].value;
  }
  return null;
}

function extractSummary(html: string): { summary: string; rest: string } {
  const match = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
  if (!match) {
    return { summary: "", rest: html.replace(/<details\b[^>]*>/i, "") };
  }
  const after = html.slice((match.index ?? 0) + match[0].length);
  return { summary: htmlToPlainText(match[1] ?? ""), rest: after.replace(/<\/details>/gi, "") };
}

function makeDetails(summary: string, body: Mdast[]): Mdast {
  const blocks = body.filter((node) => {
    if (node.type === "html" && !String(node.value ?? "").trim()) return false;
    return true;
  });
  return {
    type: "details",
    children: [
      {
        type: "detailsSummary",
        children: summary ? [{ type: "text", value: summary }] : [],
      },
      ...(blocks.length ? blocks : [{ type: "paragraph", children: [] }]),
    ],
  };
}

function mdastFromCompleteHtml(html: string): Mdast {
  const innerMatch = html.match(/<details\b[^>]*>([\s\S]*)<\/details>/i);
  const inner = innerMatch?.[1] ?? "";
  const { summary, rest } = extractSummary(`<details>${inner}</details>`);
  const leftover = htmlToPlainText(rest);
  const body: Mdast[] = leftover
    ? leftover.split(/\n{2,}/).map((part) => ({
        type: "paragraph",
        children: [{ type: "text", value: part.replace(/\s+/g, " ").trim() }],
      }))
    : [];
  return makeDetails(summary, body);
}

function isClosingDetails(html: string): boolean {
  const withoutClose = html.replace(/<\/details>/gi, "").trim();
  return /<\/details>/i.test(html) && !/<details\b/i.test(withoutClose);
}

function groupDetails(children: Mdast[]): Mdast[] {
  const out: Mdast[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (!node) continue;
    const html = htmlBlob(node);
    if (html && /<details\b/i.test(html) && /<\/details>/i.test(html)) {
      out.push(mdastFromCompleteHtml(html));
      continue;
    }
    if (html && /<details\b/i.test(html)) {
      let { summary, rest } = extractSummary(html);
      const body: Mdast[] = [];
      const leftover = htmlToPlainText(rest);
      if (leftover) {
        body.push({ type: "paragraph", children: [{ type: "text", value: leftover }] });
      }
      let cursor = index + 1;
      if (!summary) {
        const next = children[cursor];
        const nextHtml = next ? htmlBlob(next) : null;
        const onlySummary = nextHtml?.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>\s*$/i);
        if (onlySummary) {
          summary = htmlToPlainText(onlySummary[1] ?? "");
          cursor += 1;
        }
      }
      let depth = 1;
      for (; cursor < children.length; cursor += 1) {
        const next = children[cursor];
        if (!next) continue;
        const nextHtml = htmlBlob(next);
        if (nextHtml && /<details\b/i.test(nextHtml) && /<\/details>/i.test(nextHtml)) {
          body.push(next);
          continue;
        }
        if (nextHtml && /<details\b/i.test(nextHtml)) {
          depth += 1;
          body.push(next);
          continue;
        }
        if (nextHtml && isClosingDetails(nextHtml)) {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
          body.push(next);
          continue;
        }
        body.push(next);
      }
      out.push(makeDetails(summary, groupDetails(body)));
      index = cursor - 1;
      continue;
    }
    out.push(node);
  }
  return out;
}

/** Lift GFM `<details>` / `<summary>` HTML into structured mdast nodes. */
const FLOW_PARENTS = new Set(["root", "listItem", "blockquote", "details", "footnoteDefinition"]);

export function remarkMdLiveDetails() {
  return (tree: Mdast) => {
    const visit = (node: Mdast) => {
      if (!node.children) return;
      for (const child of node.children) visit(child);
      if (FLOW_PARENTS.has(node.type)) node.children = groupDetails(node.children);
    };
    visit(tree);
  };
}
