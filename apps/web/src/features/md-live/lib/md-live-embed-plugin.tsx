import React from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node } from "@milkdown/kit/prose/model";
import { $view } from "@milkdown/kit/utils";
import { MdLiveEmbedCard, MdLiveEmbedInline } from "../embeds/MdLiveEmbedCard";
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
