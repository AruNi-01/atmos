/** Mirrors `ShortcutKeySequence` in apps/web — pt-design cannot import that package. */

const TOKEN_GLYPH: Record<string, string> = {
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  mod: "⌘",
  "⌘": "⌘",
  ctrl: "Ctrl",
  control: "Ctrl",
  "⌃": "Ctrl",
  option: "⌥",
  opt: "⌥",
  alt: "⌥",
  "⌥": "⌥",
  shift: "⇧",
  "⇧": "⇧",
  enter: "↵",
  return: "↵",
  "↵": "↵",
  delete: "⌫",
  backspace: "⌫",
  "⌫": "⌫",
  esc: "Esc",
  escape: "Esc",
  tab: "⇥",
  "⇥": "⇥",
};

export function shortcutToKeys(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const glyph = TOKEN_GLYPH[part.toLowerCase()];
      if (glyph) return glyph;
      return part.length === 1 ? part.toUpperCase() : part;
    });
}

const SHORTCUT_SELECTOR =
  ".context-menu-item__shortcut, .dropdown-menu-item__shortcut";

export function decorateShortcutEl(el: HTMLElement): void {
  if (el.dataset.ptShortcutDecorated === "true") return;
  const raw = (el.textContent ?? "").trim();
  if (!raw) return;
  const keys = shortcutToKeys(raw);
  if (keys.length === 0) return;
  el.dataset.ptShortcutDecorated = "true";
  el.setAttribute("aria-label", raw);
  el.replaceChildren(
    ...keys.map((key) => {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      return kbd;
    }),
  );
}

export function decorateShortcutTree(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(SHORTCUT_SELECTOR).forEach(decorateShortcutEl);
}

export function observeShortcutDecorations(root: HTMLElement): () => void {
  decorateShortcutTree(root);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(SHORTCUT_SELECTOR)) decorateShortcutEl(node);
        else decorateShortcutTree(node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
