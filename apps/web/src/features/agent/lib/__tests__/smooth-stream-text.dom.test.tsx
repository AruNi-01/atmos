// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSmoothStreamText } from "@workspace/ui/components/ai-elements/smooth-stream-text";

let root: Root | null = null;

function Probe({ text, enabled }: { text: string; enabled: boolean }) {
  const shown = useSmoothStreamText(text, enabled);
  return <span data-shown="">{shown}</span>;
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: win });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: win.document,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  // Hold the rAF clock: we want the pending tail to stay unflushed until stop/error.
  let nextFrame = 1;
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: () => nextFrame++,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

function cleanupDom(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT;
  delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
}

describe("display buffer stop/error flush", () => {
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

  it("stop (enabled=false) paints the full target on the same commit", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Probe text="Hel" enabled />);
    });
    await act(async () => {
      root?.render(<Probe text="Hello world from the agent" enabled />);
    });
    expect(container.textContent).toBe("Hel");
    await act(async () => {
      root?.render(<Probe text="Hello world from the agent" enabled={false} />);
    });
    expect(container.textContent).toBe("Hello world from the agent");
  });

  it("error (enabled=false after a longer target) also flushes immediately", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const target = "failed while streaming the rest of this answer";

    await act(async () => {
      root?.render(<Probe text="failed" enabled />);
    });
    await act(async () => {
      root?.render(<Probe text={target} enabled />);
    });
    expect(container.textContent).toBe("failed");
    await act(async () => {
      root?.render(<Probe text={target} enabled={false} />);
    });
    expect(container.textContent).toBe(target);
  });
});
