import React from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node } from "@milkdown/kit/prose/model";
import { $view } from "@milkdown/kit/utils";
import { resolveMdLiveEmbed } from "../embeds/registry";
import {
  mdLiveEmbedBlock,
  mdLiveEmbedInline,
  mdLiveRemarkDirective,
  specFromNode,
} from "./md-live-embed-nodes";

export {
  mdLiveEmbedBlock,
  mdLiveEmbedInline,
  mdLiveRemarkDirective,
} from "./md-live-embed-nodes";

function embedView(inline: boolean) {
  return () => (node: Node) => {
    const dom = document.createElement(inline ? "span" : "div");
    dom.className = inline ? "md-live-embed-inline" : "md-live-embed-block";
    dom.contentEditable = "false";
    let root: Root | null = createRoot(dom);
    let selected = false;
    let current = node;
    const render = (n: Node, isSelected: boolean) => {
      const spec = specFromNode(n);
      if (inline) spec.layout = "inline";
      const View = resolveMdLiveEmbed(spec.kind).View;
      root?.render(<View spec={spec} selected={isSelected} />);
    };
    render(current, selected);
    return {
      dom,
      stopEvent: (event: Event) => {
        const target = event.target as HTMLElement | null;
        return Boolean(target?.closest("[data-md-live-interactive], button, a, input"));
      },
      selectNode: () => {
        selected = true;
        render(current, true);
      },
      deselectNode: () => {
        selected = false;
        render(current, false);
      },
      update: (next: Node) => {
        if (next.type.name !== current.type.name) return false;
        current = next;
        render(next, selected);
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
