// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  __resetComposerPasteForTests,
  expandPasteTokens,
  registerComposerPaste,
} from "@/shared/lib/composer-paste";

function translate(key: string, values?: Record<string, string | number>) {
  if (key === "chip" || key === "paste.chip") {
    return `Pasted: ${values?.count ?? 0} lines`;
  }
  if (key === "moreLines" || key === "paste.moreLines") {
    return `(${values?.count ?? 0} more lines...)`;
  }
  return key;
}

mock.module("next-intl", () => ({
  useTranslations: () => translate,
  createTranslator: () => translate,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("@workspace/ui/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => children,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-paste-preview="">{children}</div>
  ),
}));

mock.module("@/shared/components/follow-hover-card", () => ({
  FollowHoverCard: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("@/shared/components/composer-link-og-preview", () => ({
  ComposerLinkOgPreview: () => null,
}));

mock.module("@/shared/lib/link-preview-query", () => ({
  fetchLinkPreview: async () => {
    throw new Error("offline");
  },
  peekLinkPreview: () => null,
}));

const { UserMessageBody } = await import("../UserMessageBody");

let root: Root | null = null;

function lines(count: number): string {
  return Array.from({ length: count }, (_, i) => `msg ${i + 1}`).join("\n");
}

describe("UserMessageBody", () => {
  beforeEach(() => {
    installDom();
    __resetComposerPasteForTests();
  });

  afterEach(async () => {
    if (root) {
      const currentRoot = root;
      root = null;
      await act(async () => {
        currentRoot.unmount();
      });
    }
    cleanupDom();
    __resetComposerPasteForTests();
  });

  it("renders a paste chip when the message was sent as a chip", async () => {
    const body = lines(16);
    const token = registerComposerPaste(body);
    const expanded = expandPasteTokens(`please review\n${token}`);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<UserMessageBody text={expanded} />);
    });

    const chip = container.querySelector("[data-paste-chip]");
    expect(chip?.textContent).toContain("Pasted: 16 lines");
    expect(container.querySelector("[data-user-message-collapsed]")).not.toBeNull();
    expect(container.textContent).toContain("please review");
    expect(container.textContent).not.toContain("msg 8");

    await act(async () => {
      container
        .querySelector("[data-user-message-body]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("[data-paste-chip]")).toBeNull();
    expect(container.textContent).toContain("msg 16");

    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(container.querySelector("[data-paste-chip]")).not.toBeNull();
  });

  it("collapses long non-chip messages and expands on click, then collapses on outside click", async () => {
    const body = lines(8);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<UserMessageBody text={body} />);
    });

    const message = container.querySelector("[data-user-message-body]");
    expect(message?.hasAttribute("data-user-message-collapsed")).toBe(true);
    expect(container.querySelector("[data-user-message-fade]")).not.toBeNull();
    expect(container.textContent).toContain("msg 3");
    expect(container.textContent).toContain("msg 8");

    await act(async () => {
      message?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector("[data-user-message-collapsed]")).toBeNull();
    expect(container.querySelector("[data-user-message-fade]")).toBeNull();
    expect(container.textContent).toContain("msg 8");

    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(container.querySelector("[data-user-message-collapsed]")).not.toBeNull();
    expect(container.querySelector("[data-user-message-fade]")).not.toBeNull();
  });

  it("does not collapse messages that already fit in three lines", async () => {
    const body = lines(3);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<UserMessageBody text={body} />);
    });

    expect(container.querySelector("[data-user-message-collapsed]")).toBeNull();
    expect(container.querySelector("[data-user-message-fade]")).toBeNull();
    expect(container.textContent).toContain("msg 3");
  });

  it("keeps typed user URLs as links instead of chips", async () => {
    const url = "https://payloadcms.com/docs/components";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<UserMessageBody text={`see ${url}`} />);
    });

    expect(container.querySelector("[data-url-chip]")).toBeNull();
    const link = container.querySelector<HTMLAnchorElement>("[data-http-text-link]");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(url);
    expect(link?.textContent).toBe(url);
  });

  it("renders pasted URL tokens as chips that expand to dashed links", async () => {
    const { expandUrlTokens, formatUrlToken } = await import("@/shared/lib/link-preview");
    const url = "https://payloadcms.com/docs/components";
    const expanded = expandUrlTokens(`see ${formatUrlToken(url)}`);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<UserMessageBody text={expanded} />);
    });

    const chip = container.querySelector<HTMLElement>("[data-url-chip]");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("payloadcms.com");
    expect(container.querySelector("[data-http-text-link]")).toBeNull();

    await act(async () => {
      chip?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const link = container.querySelector<HTMLAnchorElement>("[data-http-text-link]");
    expect(container.querySelector("[data-url-chip]")).toBeNull();
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(url);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.textContent).toBe(url);
    expect(link?.className).toContain("decoration-dashed");
  });
});

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;

  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
  setGlobal("KeyboardEvent", win.KeyboardEvent);
  setGlobal("MutationObserver", win.MutationObserver);
  setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  win.SyntaxError = SyntaxError;
}

function cleanupDom(): void {
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Text",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "MutationObserver",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>)[key];
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
