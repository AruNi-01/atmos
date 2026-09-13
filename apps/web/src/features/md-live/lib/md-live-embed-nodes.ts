import type { Node } from "@milkdown/kit/prose/model";
import { $node, $remark } from "@milkdown/kit/utils";
import remarkDirective from "remark-directive";
import {
  formatDirectiveAttributes,
  formatUnknownDirectiveSource,
  parseEmbedDirective,
  remarkUnknownMdast,
  type MdLiveEmbedSpec,
} from "@atmos/md-live";

/**
 * Enable Generic Directive Syntax, then turn unmatched mdast back into
 * ordinary text. `remark-directive` accepts any Unicode letter name
 * (`:每种`, `12:30`, `:cite`, `::youtube`, `:::note`); leftover
 * `linkReference` / `imageReference` / `definition` also crash Milkdown.
 */
function remarkMdLiveDirective(this: unknown) {
  (remarkDirective as (this: unknown) => void).call(this);
  return remarkUnknownMdast();
}

export const mdLiveRemarkDirective = $remark("remarkDirective", () => remarkMdLiveDirective);

export function specFromNode(node: Node): MdLiveEmbedSpec {
  return {
    kind: String(node.attrs.kind ?? "unknown"),
    layout: node.attrs.layout === "inline" ? "inline" : "card",
    title: String(node.attrs.title ?? ""),
    attrs: JSON.parse(String(node.attrs.payload ?? "{}")) as Record<string, string>,
  };
}

function restoreUnknownTextDirective(
  state: { addText: (text: string) => unknown; next: (nodes?: unknown) => unknown },
  node: {
    name?: string;
    attributes?: Record<string, string | null | undefined> | null;
    children?: unknown[];
  },
) {
  state.addText(`:${node.name ?? ""}`);
  if (node.children?.length) {
    state.addText("[");
    state.next(node.children);
    state.addText("]");
  }
  const attrs = formatDirectiveAttributes(node.attributes);
  if (attrs) state.addText(attrs);
}

function restoreUnknownReference(
  state: { addText: (text: string) => unknown; next: (nodes?: unknown) => unknown },
  node: {
    type: string;
    alt?: string | null;
    label?: string | null;
    identifier?: string;
    referenceType?: string;
    children?: unknown[];
  },
) {
  const label = node.label || node.identifier || "";
  if (node.type === "imageReference") {
    const alt = node.alt ?? "";
    if (node.referenceType === "full") state.addText(`![${alt}][${label}]`);
    else if (node.referenceType === "collapsed") state.addText(`![${alt}][]`);
    else state.addText(`![${alt}]`);
    return;
  }
  state.addText("[");
  if (node.children?.length) state.next(node.children);
  if (node.referenceType === "full") state.addText(`][${label}]`);
  else if (node.referenceType === "collapsed") state.addText("][]");
  else state.addText("]");
}

function restoreUnknownBlockDirective(
  state: {
    addText: (text: string) => unknown;
    next: (nodes?: unknown) => unknown;
    openNode: (type: unknown) => unknown;
    closeNode: () => unknown;
    schema: { nodes: Record<string, unknown> };
  },
  node: {
    type: string;
    name?: string;
    attributes?: Record<string, string | null | undefined> | null;
    children?: unknown[];
  },
) {
  const paragraph = state.schema.nodes.paragraph;
  const line = formatUnknownDirectiveSource({
    type: node.type,
    name: node.name,
    attributes: node.attributes,
    children: node.type === "leafDirective" ? (node.children as never) : undefined,
  });
  if (paragraph) {
    state.openNode(paragraph);
    state.addText(line);
    state.closeNode();
  } else {
    state.addText(line);
  }
  if (node.type === "containerDirective") {
    if (node.children) state.next(node.children);
    if (paragraph) {
      state.openNode(paragraph);
      state.addText(":::");
      state.closeNode();
    }
  }
}

function attrsFromDirective(node: {
  type: string;
  name?: string;
  attributes?: Record<string, string>;
  children?: Array<{ value?: string }>;
}): Record<string, unknown> | null {
  const type = node.type === "textDirective" ? "textDirective" : "leafDirective";
  const label = node.children?.map((c) => c.value ?? "").join("") ?? "";
  const spec = parseEmbedDirective({
    type,
    name: node.name ?? "",
    label,
    attributes: node.attributes,
  });
  if (!spec) return null;
  return {
    kind: spec.kind,
    layout: spec.layout,
    title: spec.title,
    payload: JSON.stringify(spec.attrs),
  };
}

export const mdLiveEmbedBlock = $node("mdLiveEmbedBlock", () => ({
  group: "block",
  atom: true,
  isolating: true,
  marks: "",
  attrs: {
    kind: { default: "unknown" },
    layout: { default: "card" },
    title: { default: "" },
    payload: { default: "{}" },
  },
  parseMarkdown: {
    match: (node) =>
      node.type === "leafDirective"
      || node.type === "containerDirective"
      || node.type === "definition",
    runner: (state, node, type) => {
      const attrs = node.type === "leafDirective" ? attrsFromDirective(node as never) : null;
      if (attrs) {
        state.addNode(type, attrs);
        return;
      }
      if (node.type === "definition") {
        const label = String((node as { label?: string; identifier?: string }).label
          || (node as { identifier?: string }).identifier
          || "");
        const url = String((node as { url?: string }).url ?? "");
        const title = (node as { title?: string | null }).title;
        const titlePart = title ? ` "${String(title).replace(/"/g, '\\"')}"` : "";
        const paragraph = state.schema.nodes.paragraph;
        const line = `[${label}]: ${url}${titlePart}`;
        if (paragraph) {
          state.openNode(paragraph);
          state.addText(line);
          state.closeNode();
        } else {
          state.addText(line);
        }
        return;
      }
      restoreUnknownBlockDirective(state, node as never);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "mdLiveEmbedBlock",
    runner: (state, node) => {
      const spec = specFromNode(node);
      const children = spec.title
        ? [{ type: "text", value: spec.title }]
        : undefined;
      state.addNode("leafDirective", children, undefined, {
        name: "md-live",
        attributes: { kind: spec.kind, layout: spec.layout, ...spec.attrs },
      });
    },
  },
  toDOM: () => ["div", { class: "md-live-embed-block", contenteditable: "false" }],
  parseDOM: [{ tag: "div.md-live-embed-block" }],
}));

export const mdLiveEmbedInline = $node("mdLiveEmbedInline", () => ({
  group: "inline",
  inline: true,
  atom: true,
  isolating: true,
  marks: "",
  attrs: {
    kind: { default: "unknown" },
    layout: { default: "inline" },
    title: { default: "" },
    payload: { default: "{}" },
  },
  parseMarkdown: {
    match: (node) =>
      node.type === "textDirective"
      || node.type === "linkReference"
      || node.type === "imageReference",
    runner: (state, node, type) => {
      if (node.type === "linkReference" || node.type === "imageReference") {
        restoreUnknownReference(state, node as never);
        return;
      }
      const attrs = attrsFromDirective(node as never);
      if (attrs) {
        state.addNode(type, attrs);
        return;
      }
      restoreUnknownTextDirective(state, node as never);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "mdLiveEmbedInline",
    runner: (state, node) => {
      const spec = specFromNode(node);
      const children = spec.title
        ? [{ type: "text", value: spec.title }]
        : undefined;
      state.addNode("textDirective", children, undefined, {
        name: "md-live",
        attributes: { kind: spec.kind, layout: spec.layout, ...spec.attrs },
      });
    },
  },
  toDOM: () => ["span", { class: "md-live-embed-inline", contenteditable: "false" }],
  parseDOM: [{ tag: "span.md-live-embed-inline" }],
}));
