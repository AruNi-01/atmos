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

  it("fades opaque ink once per group so overlapping joints never brighten", () => {
    const container = renderBranch({ isFirst: false, isLast: false, animate: false });
    const group = container.querySelector("svg > g");
    expect(group?.getAttribute("stroke")).toBe("var(--foreground)");
    expect(group?.getAttribute("opacity")).toBe("0.1");
    // Round caps would spill 0.75px into the neighbouring row and composite twice.
    expect(group?.getAttribute("stroke-linecap")).toBe("butt");
    for (const stroke of container.querySelectorAll("[data-tree-stroke]")) {
      expect(stroke.getAttribute("stroke")).toBeNull();
    }
  });

  it("joins row to row: the trunk leaves where the elbow curves and runs to the row bottom", () => {
    const container = renderBranch({ isFirst: false, isLast: false, animate: false });
    const trunk = container.querySelector('[data-tree-stroke="trunk"]');
    const elbow = container.querySelector('[data-tree-stroke="elbow"]');
    // Elbow drops from the row top, so the previous row's trunk meets it with no gap.
    expect(elbow?.getAttribute("d") ?? "").toStartWith("M 8 0 V 6");
    expect(trunk?.getAttribute("y1")).toBe("6");
    expect(trunk?.getAttribute("y2")).toBe("100%");
  });

  it("holds the elbow at the icon line so expanding a row cannot move it", () => {
    const container = renderBranch({ isFirst: true, isLast: true, animate: false });
    const elbow = container.querySelector('[data-tree-stroke="elbow"]');
    expect(elbow?.getAttribute("d") ?? "").toContain("0 0 0 14 12");
  });

  it("offsets the stroke start when the row enters as part of a batch", async () => {
    const container = renderBranch({ isFirst: false, isLast: true, animate: true, delayMs: 112 });
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
    });
    const elbow = container.querySelector('[data-tree-stroke="elbow"]') as SVGPathElement | null;
    expect(elbow?.getAttribute("style") ?? "").toContain("112ms");
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

function renderBranch(props: {
  isFirst: boolean;
  isLast: boolean;
  animate: boolean;
  delayMs?: number;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <AgentTreeBranch
        isFirst={props.isFirst}
        isLast={props.isLast}
        animate={props.animate}
        delayMs={props.delayMs}
      >
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
