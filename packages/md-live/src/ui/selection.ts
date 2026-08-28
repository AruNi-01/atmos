import type { Node } from "@milkdown/kit/prose/model";
import { mdLiveTaskMarkerOf } from "./task-list";

const OVERLAY_CLOSE_SELECTOR = [
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-sub-content']",
  "[data-slot='popover-content']",
  "[data-md-live-slash]",
  "[data-md-live-toolbar]",
  "em-emoji-picker",
].join(",");

export function isMdLiveOverlayEventTarget(target: EventTarget | null, hosts: Array<Element | null>): boolean {
  if (!(target instanceof Node)) return false;
  if (hosts.some((host) => host?.contains(target))) return true;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(OVERLAY_CLOSE_SELECTOR));
}

export function mdLiveBlockKindId(
  node: { type: { name: string }; attrs: Record<string, unknown> },
  parent: { type: { name: string }; attrs: Record<string, unknown> } | null,
): string {
  if (node.type.name === "heading") {
    const level = Number(node.attrs.level);
    if (level >= 1 && level <= 6) return `h${level}`;
    return "h1";
  }
  if (node.type.name === "code_block") return "code";
  if (parent?.type.name === "list_item") {
    if (mdLiveTaskMarkerOf(parent.attrs) != null) return "todo";
    if (parent.attrs.listType === "ordered") return "ol";
    return "ul";
  }
  if (parent?.type.name === "blockquote") return "quote";
  return "paragraph";
}

export function mdLiveUnifyBlockKindId(ids: Iterable<string>): string | null {
  let found: string | null = null;
  for (const id of ids) {
    if (found == null) found = id;
    else if (found !== id) return null;
  }
  return found;
}

export function mdLiveSelectionBlockKindId(doc: Node, from: number, to: number): string | null {
  const ids: string[] = [];
  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (!node.isTextblock) return true;
    ids.push(mdLiveBlockKindId(node, parent));
    return false;
  });
  return mdLiveUnifyBlockKindId(ids);
}

export function shouldShowMdLiveSelectionToolbar(options: {
  pointerSelecting: boolean;
  selectionEmpty: boolean;
  selectedText: string;
  editable: boolean;
  editorFocused: boolean;
  tooltipFocused: boolean;
}): boolean {
  if (options.pointerSelecting) return false;
  if (!options.editable) return false;
  if (!options.editorFocused && !options.tooltipFocused) return false;
  if (options.selectionEmpty) return false;
  return options.selectedText.length > 0;
}
