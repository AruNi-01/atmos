import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePtx } from "../../protocol";
import type { PtNode } from "../../protocol";
import { PT_COMPONENT_MODULES } from "../../components/registry";
import { OverlayHost, overlayArtistInset, overlayFitStyle } from "./OverlayHost";
import { canvasOriginInBoard, findCanvasOriginNode } from "./canvas-origin";

const dir = dirname(fileURLToPath(import.meta.url));

function walk(root: string, files: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

const APP_STATE = { scrollX: 0, scrollY: 0, zoom: { value: 1 } };

function hasButtonNode(node: PtNode): boolean {
  return node.type === "button" || (node.children ?? []).some(hasButtonNode);
}

describe("OverlayHost", () => {
  test("Interact markup contains a real button for a page-level button node", () => {
    const document = parsePtx(
      `<page id="p"><button id="run" label="Run" x="10" y="20" width="100" height="40"/></page>`,
    );
    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document,
        mode: "interact",
        appState: APP_STATE,
        onCommit: () => {},
      }),
    );
    expect(html).toContain("<button");
    expect(html).toContain("data-pt-overlay-id=\"run\"");
    expect(html).toContain("data-pt-node-type=\"button\"");
    expect(html).toContain("data-pt-type=\"button\"");
    expect(html).toContain("pointer-events:auto");
  });

  test("Edit layer uses pointer-events none and still follows viewport zoom", () => {
    const document = parsePtx(
      `<page id="p"><button id="run" label="Run" x="10" y="20" width="100" height="40"/></page>`,
    );
    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document,
        mode: "edit",
        appState: { scrollX: 0, scrollY: 0, zoom: { value: 2 } },
        onCommit: () => {},
      }),
    );
    const inset = overlayArtistInset({ width: 200, height: 80 }, 2);
    expect(inset).toBe(8);
    expect(html).toContain(`left:${20 + inset}px`);
    expect(html).toContain(`top:${40 + inset}px`);
    expect(html).toContain(`width:${200 - inset * 2}px`);
    expect(html).toContain(`height:${80 - inset * 2}px`);
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("data-pt-overlay-origin=\"canvas\"");
    expect(html).not.toContain("pt-sketch-wobble");
    expect(html).toContain("background:transparent");
  });

  test("Edit overlay layers and descendants do not take pointer events; Interact does", () => {
    const document = parsePtx(
      `<page id="p"><button id="run" label="Run" x="10" y="20" width="100" height="40"/></page>`,
    );
    const edit = renderToStaticMarkup(
      createElement(OverlayHost, {
        document,
        mode: "edit",
        appState: APP_STATE,
        onCommit: () => {},
      }),
    );
    expect(edit).toContain('data-pt-mode="edit"');
    expect(edit).toContain("inert");
    expect(edit).toContain("pointer-events:none !important");
    expect(edit).toContain("[data-pt-overlay-id] *");
    const interact = renderToStaticMarkup(
      createElement(OverlayHost, {
        document,
        mode: "interact",
        appState: APP_STATE,
        onCommit: () => {},
      }),
    );
    expect(interact).toContain('data-pt-mode="interact"');
    expect(interact).toContain("pointer-events:auto");
    expect(interact).not.toContain("pointer-events:none !important");
    expect(interact).not.toContain("inert");
  });

  test("nested button keeps its own artist host so pressing it does not scale the card", () => {
    const document = parsePtx(
      `<page id="p"><form id="signup" label="Form" x="0" y="0" width="360" height="140"><button id="go" label="Submit" x="16" y="72" width="328" height="40"/></form></page>`,
    );
    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document,
        mode: "interact",
        appState: APP_STATE,
        onCommit: () => {},
      }),
    );
    expect(html).toContain('data-pt-overlay-id="signup"');
    expect(html).toContain('data-pt-node-type="form"');
    expect(html).toContain('data-pt-type="button"');
    expect(html).toContain('data-pt-id="go"');
    expect(html).toContain("data-pt-artist=\"\"");
    expect(html).not.toContain('data-pt-overlay-id="go"');
    expect(html.indexOf('data-pt-type="button"')).toBeLessThan(html.lastIndexOf("data-pt-artist"));
  });

  test("interact press markup does not attach to non-button catalog nodes", () => {
    const css = readFileSync(new URL("./sketch-ui.css", import.meta.url), "utf8");
    const pressLines = css.split("\n").filter((line) => line.includes("scale(0.96)") || line.includes("data-pt-pressed"));
    expect(pressLines.length).toBeGreaterThan(0);
    for (const line of pressLines) {
      if (!line.includes("data-pt-type")) continue;
      expect(line).toContain('[data-pt-type="button"]');
      expect(line).not.toMatch(/\[data-pt-type="(?!button")[^"]+"\]/);
    }
    const leaked: string[] = [];
    for (const mod of PT_COMPONENT_MODULES) {
      const node = mod.defaultNode(`n-${mod.type}`);
      if (hasButtonNode(node)) continue;
      const html = renderToStaticMarkup(
        createElement(OverlayHost, {
          document: { version: "ptx/1", pages: [{ id: "p", nodes: [node] }] },
          mode: "interact",
          appState: APP_STATE,
          onCommit: () => {},
        }),
      );
      if (html.includes('data-pt-type="button"')) leaked.push(mod.type);
    }
    expect(leaked).toEqual([]);
  });

  test("overlay fit scales defaultBBox into the live handle box", () => {
    expect(overlayFitStyle({ width: 240, height: 80 }, { width: 120, height: 40 })).toEqual({
      width: 120,
      height: 40,
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
      transform: "scale(2, 2)",
      transformOrigin: "top left",
    });
    const document = parsePtx(
      `<page id="p"><button id="run" label="Run" x="10" y="20" width="240" height="80"/></page>`,
    );
    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document,
        mode: "interact",
        appState: APP_STATE,
        onCommit: () => {},
      }),
    );
    const inset = overlayArtistInset({ width: 240, height: 80 }, 1);
    const box = { width: 240 - inset * 2, height: 80 - inset * 2 };
    const fit = overlayFitStyle(box, { width: 120, height: 40 });
    expect(html).toContain("data-pt-overlay-fit");
    expect(html).toContain(String(fit.transform));
    expect(html).toContain("width:120px");
    expect(html).toContain("height:40px");
    expect(html).toContain(`width:${box.width}px`);
    expect(html).toContain("<button");
  });
});

describe("overlay canvas origin", () => {
  test("overlay wrapper is canvas-sized, not full board including sidebar", () => {
    const board = {
      getBoundingClientRect: () => ({ left: 100, top: 80, width: 800, height: 600 }),
    };
    const canvas = {
      getBoundingClientRect: () => ({ left: 164, top: 124, width: 672, height: 520 }),
    };
    expect(canvasOriginInBoard(board, canvas)).toEqual({
      left: 64,
      top: 44,
      width: 672,
      height: 520,
    });
  });

  test("when canvas fills the board, origin is the board box", () => {
    const box = { left: 0, top: 0, width: 800, height: 600 };
    const el = { getBoundingClientRect: () => box };
    expect(canvasOriginInBoard(el, el)).toEqual({ left: 0, top: 0, width: 800, height: 600 });
  });

  test("findCanvasOriginNode prefers the interactive canvas over .excalidraw chrome", () => {
    const board = {
      querySelector(selector: string) {
        if (selector === "canvas.excalidraw__canvas.interactive") return { id: "interactive" };
        if (selector === ".excalidraw__canvas-wrapper") return { id: "wrapper" };
        if (selector === ".excalidraw") return { id: "chrome" };
        return null;
      },
    };
    expect(findCanvasOriginNode(board as unknown as ParentNode)).toEqual({ id: "interactive" });
    const noInteractive = {
      querySelector(selector: string) {
        if (selector === ".excalidraw__canvas-wrapper") return { id: "wrapper" };
        if (selector === ".excalidraw") return { id: "chrome" };
        return null;
      },
    };
    expect(findCanvasOriginNode(noInteractive as unknown as ParentNode)).toEqual({ id: "wrapper" });
  });

  test("OverlayHost wires canvas origin against the board canvas, not inset-on-chrome", () => {
    const src = readFileSync(new URL("./OverlayHost.tsx", import.meta.url), "utf8");
    expect(src).toContain("data-pt-overlay-origin");
    expect(src).toContain("canvasOriginInBoard");
    expect(src).toContain("findCanvasOriginNode");
    expect(src).toContain("ArtistInkHost");
    expect(src).toContain("pt-design-board");
    expect(src).not.toContain("createPortal");
    const css = readFileSync(new URL("./sketch-ui.css", import.meta.url), "utf8");
    expect(css).toContain('[data-pt-mode="interact"]');
    expect(css).toContain('[data-pt-type="button"][data-pt-pressed]');
    expect(css).toContain(":has(:active)");
    expect(css).toContain("scale(0.96)");
    expect(css).not.toContain("[data-pt-overlay-id][data-pt-pressed] [data-pt-artist]");
    expect(src).toContain("pressableButtonRoot");
    expect(src).toContain("armInteractPress");
    expect(src).toContain("data-pt-node-type");
    const ink = readFileSync(new URL("./artist-ink.tsx", import.meta.url), "utf8");
    expect(ink).toContain('data-pt-artist=""');
    expect(ink).toContain("el.dataset.ptArtist");
    const press = readFileSync(new URL("./interact-press.ts", import.meta.url), "utf8");
    expect(press).toContain('INTERACT_PRESS_NODE_TYPE = "button"');
    expect(press).toContain('getAttribute("data-pt-type") !== INTERACT_PRESS_NODE_TYPE');
  });
});

describe("overlay sources", () => {
  test("do not createPortal to document.body", () => {
    const hits: string[] = [];
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("createPortal") || text.includes("document.body")) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
