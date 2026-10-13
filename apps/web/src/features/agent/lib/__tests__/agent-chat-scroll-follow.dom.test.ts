// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import {
  AGENT_CHAT_SCROLL_CLASS,
  isTranscriptScrolledToEnd,
} from "@/features/agent/lib/agent-chat-transcript-window";

type Scroller = {
  el: HTMLElement;
  grow: (nextHeight: number) => void;
  scrollAway: (top: number) => void;
  top: () => number;
};

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: win });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: win.document,
  });
}

function cleanupDom(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
}

function mountScroller(init: { height: number; client: number; top: number }): Scroller {
  let scrollHeight = init.height;
  const clientHeight = init.client;
  let scrollTop = init.top;
  const el = document.createElement("div");
  el.className = AGENT_CHAT_SCROLL_CLASS;
  Object.defineProperties(el, {
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => clientHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Number(value);
      },
    },
  });
  document.body.append(el);
  return {
    el: el as unknown as HTMLElement,
    grow(nextHeight) {
      const pinned = isTranscriptScrolledToEnd(el as unknown as HTMLElement);
      scrollHeight = nextHeight;
      if (pinned) {
        scrollTop = Math.max(0, scrollHeight - clientHeight);
      }
    },
    scrollAway(top) {
      scrollTop = top;
    },
    top: () => scrollTop,
  };
}

describe("transcript DOM scroll follow", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    cleanupDom();
  });

  it("stays pinned to the end when new rows grow the scroller", () => {
    const scroller = mountScroller({ height: 1000, client: 200, top: 800 });
    expect(scroller.el.className).toBe(AGENT_CHAT_SCROLL_CLASS);
    expect(isTranscriptScrolledToEnd(scroller.el)).toBe(true);

    scroller.grow(1600);
    expect(scroller.top()).toBe(1400);
    expect(isTranscriptScrolledToEnd(scroller.el)).toBe(true);
  });

  it("does not jump a scrolled-up reading position when content grows", () => {
    const scroller = mountScroller({ height: 1000, client: 200, top: 800 });
    scroller.scrollAway(120);
    expect(isTranscriptScrolledToEnd(scroller.el)).toBe(false);

    scroller.grow(1800);
    expect(scroller.top()).toBe(120);
    expect(isTranscriptScrolledToEnd(scroller.el)).toBe(false);
  });
});
