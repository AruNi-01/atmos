import BananaSlug from "github-slugger";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

export function slugMdLiveHeading(text: string, slugger = new BananaSlug()): string {
  return slugger.slug(text);
}

export function syncMdLiveHeadingIds(state: EditorState): Transaction | null {
  const slugger = new BananaSlug();
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const id = slugger.slug(node.textContent);
    if (node.attrs.id === id) return;
    tr ??= state.tr.setMeta("addToHistory", false);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
  });
  return tr;
}

export const mdLiveHeadingIdPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("md-live-heading-id"),
    appendTransaction(transactions, _old, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      return syncMdLiveHeadingIds(newState);
    },
  });
});
