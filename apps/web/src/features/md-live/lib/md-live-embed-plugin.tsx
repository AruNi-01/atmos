import React from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node } from "@milkdown/kit/prose/model";
import { $node, $remark, $view } from "@milkdown/kit/utils";
import remarkDirective from "remark-directive";
import {
  parseEmbedDirective,
  type MdLiveEmbedSpec,
} from "@atmos/md-live";
import { MdLiveEmbedCard, MdLiveEmbedInline } from "../embeds/MdLiveEmbedCard";

export const mdLiveRemarkDirective = $remark("remarkDirective", () => remarkDirective);

function specFromNode(node: Node): MdLiveEmbedSpec {
  return {
    kind: String(node.attrs.kind ?? "unknown"),
    layout: node.attrs.layout === "inline" ? "inline" : "card",
    title: String(node.attrs.title ?? ""),
    attrs: JSON.parse(String(node.attrs.payload ?? "{}")) as Record<string, string>,
  };
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
    match: (node) => node.type === "leafDirective" && node.name === "md-live",
    runner: (state, node, type) => {
      const attrs = attrsFromDirective(node as never);
      if (!attrs) return;
      state.addNode(type, attrs);
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
    match: (node) => node.type === "textDirective" && node.name === "md-live",
    runner: (state, node, type) => {
      const attrs = attrsFromDirective(node as never);
      if (!attrs) return;
      state.addNode(type, attrs);
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

function embedView(inline: boolean) {
  return () => (node: Node) => {
    const dom = document.createElement(inline ? "span" : "div");
    dom.contentEditable = "false";
    let root: Root | null = createRoot(dom);
    const render = (n: Node) => {
      const spec = specFromNode(n);
      const view = inline ? (
        <MdLiveEmbedInline spec={spec} />
      ) : (
        <MdLiveEmbedCard spec={spec} />
      );
      root?.render(view);
    };
    render(node);
    return {
      dom,
      stopEvent: (event: Event) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest("[data-md-live-interactive], button, a, input"));
      },
      update: (next: Node) => {
        if (next.type.name !== node.type.name) return false;
        render(next);
        return true;
      },
      destroy: () => {
        root?.unmount();
        root = null;
      },
    };
  };
}

export const mdLiveEmbedBlockView = $view(mdLiveEmbedBlock, embedView(false));
export const mdLiveEmbedInlineView = $view(mdLiveEmbedInline, embedView(true));

export const mdLiveEmbedPlugins = [
  mdLiveRemarkDirective,
  mdLiveEmbedBlock,
  mdLiveEmbedInline,
  mdLiveEmbedBlockView,
  mdLiveEmbedInlineView,
];
