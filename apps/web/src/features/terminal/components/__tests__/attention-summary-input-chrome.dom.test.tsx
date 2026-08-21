// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

mock.module("@/features/welcome/components/PromptComposer", () => ({
  PromptComposer: React.forwardRef(function MockPromptComposer() {
    return <div data-testid="composer" />;
  }),
}));

mock.module("@/features/welcome/components/AttachmentBar", () => ({
  AttachmentBar: () => null,
}));

const { TerminalAgentInputShell } = await import("../TerminalAgentInputShell");
const { AttentionSummaryPanel } = await import("../AttentionSummaryPanel");

const summary = {
  stablePaneId: "ws-1:main",
  contextId: "ws-1",
  sessionId: "sess-1",
  status: "ready" as const,
  summary: "Agent finished the repo walkthrough.",
  nextSteps: ["Pull or rebase onto origin/main if you want to catch up"],
  canCloseSession: true,
  startedAt: 1,
};

let root: Root | null = null;

describe("attention summary inside terminal input shell", () => {
  beforeEach(() => {
    installDom();
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
  });

  it("renders the summary card inside the outer input shell", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const composerRef = { current: null };
    const inputShellRef = { current: null };

    await act(async () => {
      root?.render(
        <TerminalAgentInputShell
          attachments={[]}
          canSubmit={false}
          composerRef={composerRef}
          handleAttachmentRemove={() => undefined}
          handleImagePaste={() => undefined}
          handleTextChange={() => undefined}
          header={
            <AttentionSummaryPanel
              summary={summary}
              onPickNextStep={() => undefined}
              onDismiss={() => undefined}
            />
          }
          inputShellRef={inputShellRef}
          isOverlayVisible
          isSendAnimating={false}
          isSendExiting={false}
          isSending={false}
          onAtCancel={() => undefined}
          onAtTrigger={() => undefined}
          onPreviewAttachment={() => undefined}
          onSlashCancel={() => undefined}
          onSlashTrigger={() => undefined}
          onSubmit={() => undefined}
          placeholder="Input anything"
          startSendExit={() => undefined}
        />,
      );
    });

    const shell = container.querySelector(".terminal-agent-input-shell");
    const header = container.querySelector(".terminal-agent-input-header");
    const panel = container.querySelector(".attention-summary-panel");
    expect(shell).not.toBeNull();
    expect(header?.getAttribute("data-visible")).toBe("true");
    expect(panel).not.toBeNull();
    expect(shell?.contains(panel)).toBe(true);
    expect(panel?.className).toContain("border-dashed");
    expect(panel?.className).toContain("bg-[#e7eef2]");
    expect(panel?.className).toContain("dark:bg-[#0d171e]");
  });

  it("collapses the shell — and the attached summary — when the input is hidden", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const composerRef = { current: null };
    const inputShellRef = { current: null };

    await act(async () => {
      root?.render(
        <TerminalAgentInputShell
          attachments={[]}
          canSubmit={false}
          composerRef={composerRef}
          handleAttachmentRemove={() => undefined}
          handleImagePaste={() => undefined}
          handleTextChange={() => undefined}
          header={
            <AttentionSummaryPanel
              summary={summary}
              onPickNextStep={() => undefined}
            />
          }
          inputShellRef={inputShellRef}
          isOverlayVisible={false}
          isSendAnimating={false}
          isSendExiting={false}
          isSending={false}
          onAtCancel={() => undefined}
          onAtTrigger={() => undefined}
          onPreviewAttachment={() => undefined}
          onSlashCancel={() => undefined}
          onSlashTrigger={() => undefined}
          onSubmit={() => undefined}
          placeholder="Input anything"
          startSendExit={() => undefined}
        />,
      );
    });

    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("grid-rows-[0fr]");
    expect(wrapper?.className).toContain("opacity-0");
    expect(
      container.querySelector(".terminal-agent-input-header")?.getAttribute("data-visible"),
    ).toBe("true");
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
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
