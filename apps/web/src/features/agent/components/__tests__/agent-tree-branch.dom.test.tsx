// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("motion/react", () => ({
  useReducedMotion: () => false,
}));

const { AgentTreeBranch } = await import("../AgentTreeBranch");

let root: Root | null = null;

describe("AgentTreeBranch", () => {
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

  it("paints the elbow over an opaque fill so the trunk cannot double-blend", () => {
    const container = renderBranch({ isFirst: true, isLast: false, animate: false });
    const trunk = container.querySelector("[data-tree-trunk]");
    const elbow = container.querySelector("[data-tree-elbow]");
    expect(trunk?.className).toContain("bg-background");
    expect(trunk?.className).toContain("w-px");
    expect((trunk as HTMLElement | null)?.style.backgroundImage).toContain("var(--border)");
    expect(elbow?.className).toContain("bg-background");
    expect(elbow?.className).toContain("border-border");
    expect(elbow?.className).toContain("z-[1]");
  });

  it("omits the continuing trunk on the last child", () => {
    const container = renderBranch({ isFirst: false, isLast: true, animate: false });
    expect(container.querySelector("[data-tree-trunk]")).toBeNull();
    expect(container.querySelector("[data-tree-elbow]")).not.toBeNull();
  });

  it("does not restart the elbow draw when a sibling is added below", () => {
    const calls: unknown[] = [];
    const stub = {
      animate(this: unknown, keyframes: unknown, options?: unknown) {
        calls.push({ keyframes, options });
        return { cancel() {}, commitStyles() {} };
      },
    };
    (window.HTMLElement.prototype as unknown as { animate: typeof stub.animate }).animate = stub.animate;
    (window.Element.prototype as unknown as { animate: typeof stub.animate }).animate = stub.animate;

    const container = renderBranch({ isFirst: true, isLast: true, animate: true });
    expect(calls).toHaveLength(1);
    const elbow = container.querySelector("[data-tree-elbow]");

    act(() => {
      root?.render(
        <AgentTreeBranch isFirst isLast={false} animate>
          <span>Read page.tsx</span>
        </AgentTreeBranch>,
      );
    });

    expect(calls).toHaveLength(1);
    expect(container.querySelector("[data-tree-elbow]")).toBe(elbow);
    expect(container.querySelector("[data-tree-trunk]")).not.toBeNull();
  });

  it("cleanup after unmount does not throw when commitStyles cannot target the elbow", () => {
    const cancelCalls: string[] = [];
    const stub = {
      animate() {
        return {
          playState: "running" as const,
          commitStyles() {
            throw new DOMException(
              "Failed to execute 'commitStyles' on 'Animation': Target element is not rendered",
              "InvalidStateError",
            );
          },
          cancel() {
            cancelCalls.push("cancel");
          },
        };
      },
    };
    (window.HTMLElement.prototype as unknown as { animate: typeof stub.animate }).animate = stub.animate;
    (window.Element.prototype as unknown as { animate: typeof stub.animate }).animate = stub.animate;

    renderBranch({ isFirst: true, isLast: true, animate: true });
    expect(() => {
      act(() => {
        root?.unmount();
        root = null;
      });
    }).not.toThrow();
    expect(cancelCalls.length).toBeGreaterThan(0);
  });
});

function renderBranch(props: { isFirst: boolean; isLast: boolean; animate: boolean }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <AgentTreeBranch isFirst={props.isFirst} isLast={props.isLast} animate={props.animate}>
        <span>Read page.tsx</span>
      </AgentTreeBranch>,
    );
  });
  return container;
}

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
