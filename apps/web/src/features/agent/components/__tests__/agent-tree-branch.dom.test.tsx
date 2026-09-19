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

  it("draws the elbow and trunk as rounded SVG strokes", () => {
    const container = renderBranch({ isFirst: true, isLast: false, animate: false });
    const trunk = container.querySelector('[data-tree-stroke="trunk"]');
    const elbow = container.querySelector('[data-tree-stroke="elbow"]');
    expect(trunk?.tagName.toLowerCase()).toBe("line");
    expect(elbow?.tagName.toLowerCase()).toBe("path");
    expect(elbow?.getAttribute("d") ?? "").toContain("A ");
    expect(elbow?.getAttribute("pathLength") ?? elbow?.getAttribute("pathlength")).toBe("1");
  });

  it("omits the continuing trunk on the last child", () => {
    const container = renderBranch({ isFirst: false, isLast: true, animate: false });
    expect(container.querySelector('[data-tree-stroke="trunk"]')).toBeNull();
    expect(container.querySelector('[data-tree-stroke="elbow"]')).not.toBeNull();
  });

  it("does not restart the elbow draw when a sibling is added below", () => {
    const container = renderBranch({ isFirst: true, isLast: true, animate: true });
    const elbow = container.querySelector('[data-tree-stroke="elbow"]') as SVGPathElement | null;
    expect(elbow).not.toBeNull();
    if (elbow) elbow.dataset.mark = "kept";

    act(() => {
      root?.render(
        <AgentTreeBranch isFirst isLast={false} animate>
          <span>Read page.tsx</span>
        </AgentTreeBranch>,
      );
    });

    const nextElbow = container.querySelector('[data-tree-stroke="elbow"]') as HTMLElement | null;
    expect(nextElbow?.dataset.mark).toBe("kept");
    expect(container.querySelector('[data-tree-stroke="trunk"]')).not.toBeNull();
  });

  it("unmount does not throw while a draw is pending", () => {
    renderBranch({ isFirst: true, isLast: true, animate: true });
    expect(() => {
      act(() => {
        root?.unmount();
        root = null;
      });
    }).not.toThrow();
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
  setGlobal("SVGElement", win.SVGElement);
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
    "SVGElement",
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
