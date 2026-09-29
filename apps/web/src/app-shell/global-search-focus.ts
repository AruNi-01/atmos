export const GLOBAL_SEARCH_TABS = ["app", "files", "code", "sessions"] as const;
export type SearchTab = (typeof GLOBAL_SEARCH_TABS)[number];

const GLOBAL_SEARCH_SHORTCUT_KEYS = new Set([
  "Tab",
  "Enter",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export type GlobalSearchTypeaheadEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  target: EventTarget | null;
};

export function isGlobalSearchShortcutKey(key: string): boolean {
  return GLOBAL_SEARCH_SHORTCUT_KEYS.has(key);
}

export function applyGlobalSearchTypedKey(query: string, key: string): string {
  if (key === "Backspace") return query.slice(0, -1);
  if (key.length === 1) return query + key;
  return query;
}

function isEditableTarget(target: EventTarget | null, input: HTMLInputElement): boolean {
  if (target == null) return false;
  if (target === input) return true;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  const tag = element.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return element.isContentEditable === true;
}

export function resolveGlobalSearchSelectedValue({
  isOpen,
  tab,
  query,
  firstAppItemId,
  firstFilePath,
  firstCodeValue,
  firstSessionValue,
}: {
  isOpen: boolean;
  tab: SearchTab;
  query: string;
  firstAppItemId?: string;
  firstFilePath?: string;
  firstCodeValue?: string;
  firstSessionValue?: string;
}): string {
  if (!isOpen) return "";
  if (tab === "sessions") return firstSessionValue ?? "";
  if (query.trim() === "") return "";
  if (tab === "app") return firstAppItemId ?? "";
  if (tab === "files") return firstFilePath ?? "";
  return firstCodeValue ?? "";
}

export function resolveGlobalSearchTypeahead(
  event: GlobalSearchTypeaheadEvent,
  input: HTMLInputElement | null,
  query: string,
): { focus: boolean; preventDefault: boolean; query: string } | null {
  if (!input) return null;
  if (isEditableTarget(event.target, input)) return null;

  if (event.isComposing || event.key === "Process") {
    return { focus: true, preventDefault: false, query };
  }

  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isGlobalSearchShortcutKey(event.key)) return null;
  if (event.key !== "Backspace" && event.key !== "Delete" && event.key.length !== 1) {
    return null;
  }

  return {
    focus: true,
    preventDefault: true,
    query: applyGlobalSearchTypedKey(query, event.key),
  };
}
