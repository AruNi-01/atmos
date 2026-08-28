export type TextareaTriggerContext = {
  query: string;
  offset: number;
  caretRect: DOMRect;
};

const POPOVER_WIDTH = 460;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

export function popoverAboveRect(caretRect: DOMRect): { bottom: number; left: number } {
  const viewportWidth = typeof window === "undefined" ? POPOVER_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  return {
    bottom: Math.max(VIEWPORT_MARGIN, viewportHeight - caretRect.top + POPOVER_GAP),
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, caretRect.left),
      Math.max(VIEWPORT_MARGIN, viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
    ),
  };
}

function tokenStartOk(before: string, idx: number): boolean {
  return idx === 0 || /\s/.test(before.charAt(idx - 1));
}

export function readTextareaAtTrigger(
  textarea: HTMLTextAreaElement,
): TextareaTriggerContext | null {
  const pos = textarea.selectionStart ?? 0;
  if (textarea.selectionEnd !== pos) return null;
  const before = textarea.value.slice(0, pos);
  const idx = before.lastIndexOf("@");
  if (idx < 0 || !tokenStartOk(before, idx)) return null;
  const query = before.slice(idx + 1);
  if (query.includes("\n") || /\s/.test(query)) return null;
  return {
    query,
    offset: idx,
    caretRect: textarea.getBoundingClientRect(),
  };
}

export function readTextareaSlashTrigger(
  textarea: HTMLTextAreaElement,
): TextareaTriggerContext | null {
  const pos = textarea.selectionStart ?? 0;
  if (textarea.selectionEnd !== pos) return null;
  const before = textarea.value.slice(0, pos);
  const idx = before.lastIndexOf("/");
  if (idx < 0 || !tokenStartOk(before, idx)) return null;
  const at = before.lastIndexOf("@");
  if (at >= 0 && at < idx && !/\s/.test(before.slice(at + 1))) return null;
  const query = before.slice(idx + 1);
  if (query.includes("\n") || /\s/.test(query)) return null;
  return {
    query,
    offset: idx,
    caretRect: textarea.getBoundingClientRect(),
  };
}

export function replaceTextareaTrigger(
  value: string,
  offset: number,
  queryLength: number,
  insert: string,
): string {
  const from = Math.max(offset, 0);
  const to = Math.min(from + 1 + queryLength, value.length);
  return `${value.slice(0, from)}${insert}${value.slice(to)}`;
}
