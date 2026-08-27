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
