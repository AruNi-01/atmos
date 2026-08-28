import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { remarkGFMPlugin } from "@milkdown/kit/preset/gfm";

/**
 * CommonMark-style stringify that stays close to hand-written source.
 * Milkdown does not need padded tables or `<br />` sentinels to parse.
 */
export const MD_LIVE_REMARK_STRINGIFY_OPTIONS = {
  bullet: "-",
  bulletOther: "*",
  closeAtx: false,
  emphasis: "*",
  fence: "`",
  fences: true,
  incrementListMarker: true,
  listItemIndent: "one",
  rule: "-",
  setext: false,
  strong: "*",
} as const;

/** Compact GFM tables: keep `| cell |` padding, do not pad columns to equal width. */
export const MD_LIVE_REMARK_GFM_OPTIONS = {
  tableCellPadding: true,
  tablePipeAlign: false,
} as const;

const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;
const STANDALONE_BR_RE = /^[ \t]*<br\s*\/?>[ \t]*$/i;
const LIST_BR_RE = /^([ \t]*(?:[-*+]|\d+\.)[ \t]*)<br\s*\/?>[ \t]*$/i;
const TABLE_ALIGN_ROW_RE =
  /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(?:\|[ \t]*:?-{1,}:?[ \t]*)+\|?[ \t]*$/;

function fenceMarker(line: string): string | null {
  const match = line.match(FENCE_RE);
  return match?.[1] ?? null;
}

function expandTableDelimiter(token: string): string {
  const left = token.startsWith(":") ? ":" : "";
  const right = token.endsWith(":") && token.length > left.length ? ":" : "";
  const dashes = token.length - left.length - right.length;
  return `${left}${"-".repeat(Math.max(dashes, 3))}${right}`;
}

function formatFlowLine(line: string): string | null {
  if (STANDALONE_BR_RE.test(line)) return null;
  const list = line.match(LIST_BR_RE);
  if (list) return list[1] ?? line;
  let next = line.replace(/(\|)[ \t]*<br\s*\/?>[ \t]*(?=\|)/gi, "$1 ");
  if (TABLE_ALIGN_ROW_RE.test(next)) {
    next = next.replace(/:?-{1,}:?/g, expandTableDelimiter);
  }
  return next;
}

/**
 * Drop Milkdown empty-paragraph `<br />` sentinels and keep GFM delimiter
 * rows at three dashes, without touching fenced code.
 */
export function formatMdLiveSerializedMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let emptyRun = 0;

  for (const line of lines) {
    const marker = fenceMarker(line);
    if (marker) {
      const kind = marker[0] ?? "`";
      if (!fence) fence = marker;
      else if (kind === fence[0] && marker.length >= fence.length) fence = null;
      emptyRun = 0;
      out.push(line);
      continue;
    }
    if (fence) {
      emptyRun = 0;
      out.push(line);
      continue;
    }
    const formatted = formatFlowLine(line);
    if (formatted == null || formatted.trim() === "") {
      emptyRun += 1;
      if (emptyRun === 1) out.push("");
      continue;
    }
    emptyRun = 0;
    out.push(formatted);
  }

  return out.join("\n").replace(/`\u200B+`/g, "").replaceAll("\u200B", "");
}

type MdastLike = { type: string; children?: MdastLike[]; value?: string };

type StringifyState = {
  containerPhrasing: (node: MdastLike, info: { before: string; after: string }) => string;
  containerFlow: (node: MdastLike, info: unknown) => string;
};

function phrasingOf(state: StringifyState, node: MdastLike): string {
  if (node.children?.length) return state.containerPhrasing(node, { before: "", after: "" });
  return typeof node.value === "string" ? node.value : "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stringifyMdLiveDetails(
  node: MdastLike,
  _parent: unknown,
  state: StringifyState,
  info: unknown,
): string {
  const children = node.children ?? [];
  const summary = children.find((child) => child.type === "detailsSummary");
  const rest = children.filter((child) => child.type !== "detailsSummary");
  const summaryText = escapeHtml(summary ? phrasingOf(state, summary) : "");
  const inner = rest.length
    ? state.containerFlow({ type: "root", children: rest }, info).trim()
    : "";
  if (inner) return `<details>\n<summary>${summaryText}</summary>\n\n${inner}\n</details>`;
  return `<details>\n<summary>${summaryText}</summary>\n</details>`;
}

export function stringifyMdLiveDetailsSummary(
  node: MdastLike,
  _parent: unknown,
  state: StringifyState,
): string {
  return `<summary>${escapeHtml(phrasingOf(state, node))}</summary>`;
}

export function applyMdLiveRemarkConfig(ctx: Ctx): void {
  const current = ctx.get(remarkStringifyOptionsCtx);
  ctx.set(remarkStringifyOptionsCtx, {
    ...current,
    ...MD_LIVE_REMARK_STRINGIFY_OPTIONS,
    handlers: {
      ...(current.handlers ?? {}),
      details: stringifyMdLiveDetails,
      detailsSummary: stringifyMdLiveDetailsSummary,
    } as typeof current.handlers,
  });
  const gfmOptions = ctx.get(remarkGFMPlugin.options.key);
  ctx.set(remarkGFMPlugin.options.key, {
    ...(gfmOptions ?? {}),
    ...MD_LIVE_REMARK_GFM_OPTIONS,
  });
}
