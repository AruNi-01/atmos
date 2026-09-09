// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CenterStageShortcutTooltipBody } from "@/app-shell/center-stage-tab-tooltip";

let root: Root | null = null;

function installDom() {
  const window = new Window({ url: "http://localhost/" });
  globalThis.window = window as unknown as typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
}

function cleanupDom() {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
}

describe("center stage tab kind chip tooltip", () => {
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

  it("renders TUI and Chat UI chips to the right of the title", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <>
          <CenterStageShortcutTooltipBody kind="TUI">
            Claude
          </CenterStageShortcutTooltipBody>
          <CenterStageShortcutTooltipBody kind="Chat UI" digit={2}>
            Codex
          </CenterStageShortcutTooltipBody>
          <CenterStageShortcutTooltipBody digit={3}>Terminal</CenterStageShortcutTooltipBody>
        </>,
      );
    });

    const chips = [...container.querySelectorAll("[data-center-tab-kind-chip]")];
    expect(chips.map((el) => el.textContent)).toEqual(["TUI", "Chat UI"]);
    expect(container.textContent).toContain("Claude");
    expect(container.textContent).toContain("Codex");
    expect(container.textContent).toContain("2");
    expect(chips[0]?.previousSibling?.textContent).toContain("Claude");
    expect(chips[1]?.nextSibling?.textContent).toContain("2");
  });
});
