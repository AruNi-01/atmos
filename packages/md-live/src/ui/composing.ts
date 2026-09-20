import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

/**
 * IME composition guard.
 *
 * ProseMirror sets `view.composing` only *after* it flushes the DOM on
 * `compositionstart`. Plugins that `setNodeMarkup` from that flush still see
 * `composing === false`, recreate the block, and abort CJK input (pinyin
 * flashes then turns into Latin letters).
 *
 * `handleDOMEvents.compositionstart` runs *before* that flush, so this flag
 * is visible to heading-id / task / inline-code mutations in time.
 */
let session = false;

export function isMdLiveComposing(view?: { composing?: boolean }): boolean {
  return session || Boolean(view?.composing);
}

export function mdLiveMarkComposing(on: boolean): void {
  session = on;
}

function noteCompositionEvent(event: Event): void {
  if (event.type === "compositionstart") {
    session = true;
    return;
  }
  if (event.type === "compositionend") {
    session = false;
    return;
  }
  if (event.type !== "beforeinput") return;
  const input = event as InputEvent;
  if (input.isComposing || input.inputType.toLowerCase().includes("composition")) {
    session = true;
  }
}

export const mdLiveCompositionDomHandlers = {
  compositionstart(_view: unknown, event: Event) {
    noteCompositionEvent(event);
    return false;
  },
  compositionend(_view: unknown, event: Event) {
    noteCompositionEvent(event);
    return false;
  },
  beforeinput(_view: unknown, event: Event) {
    noteCompositionEvent(event);
    return false;
  },
};

export const mdLiveComposingPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("mdLiveComposing"),
    props: {
      handleDOMEvents: mdLiveCompositionDomHandlers,
    },
    view: () => ({
      destroy: () => {
        session = false;
      },
    }),
  });
});
