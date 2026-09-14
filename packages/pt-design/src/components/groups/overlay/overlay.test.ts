import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePtx, serializePtx, type PtNode } from "../../../protocol";
import { OVERLAY_MODULES } from "./index";

const TYPES = [
  "alert-dialog",
  "context-menu",
  "dialog",
  "drawer",
  "dropdown-menu",
  "hover-card",
  "menubar",
  "navigation-menu",
  "popover",
  "sheet",
  "toast",
  "sonner",
  "tooltip",
  "command",
] as const;

function noopCommit(): void {}

function moduleOf(type: (typeof TYPES)[number]) {
  const mod = OVERLAY_MODULES.find((item) => item.type === type);
  if (!mod) throw new Error(`missing overlay module ${type}`);
  return mod;
}

function markup(type: (typeof TYPES)[number], mode: "edit" | "interact", node?: PtNode): string {
  const mod = moduleOf(type);
  return renderToStaticMarkup(
    createElement(mod.Renderer, {
      node: node ?? mod.defaultNode(`pt_${type}`),
      mode,
      onCommit: noopCommit,
    }),
  );
}

describe("OVERLAY_MODULES", () => {
  test("has 14 unique types matching the overlay catalog", () => {
    const types = OVERLAY_MODULES.map((item) => item.type);
    expect(types).toHaveLength(14);
    expect(new Set(types).size).toBe(14);
    expect(new Set(types)).toEqual(new Set(TYPES));
  });

  test("each defaultNode wraps into a page that parsePtx accepts", () => {
    const overlayTypes = new Set(OVERLAY_MODULES.map((item) => item.type));
    for (const mod of OVERLAY_MODULES) {
      const node = mod.defaultNode(`pt_${mod.type}`);
      expect(node.id).toBe(`pt_${mod.type}`);
      expect(node.type).toBe(mod.type);
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.rotation).toBe(0);
      expect(node.width).toBe(mod.defaultBBox.width);
      expect(node.height).toBe(mod.defaultBBox.height);
      for (const child of node.children ?? []) {
        expect(overlayTypes.has(child.type)).toBe(true);
      }
      const xml = serializePtx({ version: "ptx/1", pages: [{ id: "page", nodes: [node] }] });
      const doc = parsePtx(xml);
      expect(doc.pages[0]!.nodes[0]!.type).toBe(mod.type);
      expect(doc.pages[0]!.nodes[0]!.id).toBe(node.id);
    }
  });

  test("dialog defaultBBox is large enough for an in-place panel", () => {
    const bbox = moduleOf("dialog").defaultBBox;
    expect(bbox.width).toBeGreaterThanOrEqual(280);
    expect(bbox.height).toBeGreaterThanOrEqual(160);
  });
});

describe("S5 in-place overlay renderers (no document.body portal)", () => {
  test("S5 representative page PTX parsePtx accepts dialog + block-auth-form", () => {
    const doc = parsePtx(`<page id="s5-rep">
  <dialog id="dlg" title="Dialog" description="Review the details and confirm to continue." label="Confirm" x="40" y="40" width="320" height="200"/>
  <block-auth-form id="auth" title="Sign in" x="400" y="40" width="360" height="228">
    <input id="auth-email" label="Email" x="16" y="52" width="328" height="40"/>
    <input id="auth-password" label="Password" x="16" y="100" width="328" height="40"/>
    <button id="auth-submit" label="Continue" x="16" y="156" width="328" height="40"/>
  </block-auth-form>
</page>`);
    const nodes = doc.pages[0]!.nodes;
    expect(nodes.map((node) => node.id)).toEqual(["dlg", "auth"]);
    expect(nodes[0]!.type).toBe("dialog");
    expect(nodes[1]!.type).toBe("block.auth-form");
    const kids = nodes[1]!.children ?? [];
    expect(kids.map((child) => child.type)).toEqual(["input", "input", "button"]);
  });

  test("dialog interact markup includes title text and has no portal traces", () => {
    const node = moduleOf("dialog").defaultNode("dlg");
    const html = markup("dialog", "interact", node);
    expect(html).toContain(String(node.props.title));
    expect(html.toLowerCase()).not.toContain("createportal");
    expect(html).not.toContain("document.body");
    expect(html).not.toMatch(/data-radix-portal|radix-portal/i);
    expect(html).toContain("Confirm");
  });

  test("overlay source files never portal to document.body", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const hits: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      if (text.includes("createPortal") || /\bdocument\.body\b/.test(text)) hits.push(name);
    }
    expect(hits).toEqual([]);
  });

  test("dropdown-menu interact markup exposes clickable menu items", () => {
    const html = markup("dropdown-menu", "interact");
    expect(html).toMatch(/role="menuitem"/);
    expect(html).toMatch(/<button\b/);
    expect(html).toContain("Open");
  });

  test("edit mode sets inert and disables pointer events on the root", () => {
    const html = markup("dialog", "edit");
    expect(html).toMatch(/\binert\b/);
    expect(html).toMatch(/pointer-events:\s*none/);
  });

  test("unknown child types render an unresolved marker", () => {
    const dialog = moduleOf("dialog").defaultNode("dlg");
    const node: PtNode = {
      ...dialog,
      children: [
        {
          id: "go",
          type: "button",
          props: { label: "Go" },
          x: 16,
          y: 120,
          width: 80,
          height: 32,
          rotation: 0,
        },
      ],
    };
    const html = markup("dialog", "interact", node);
    expect(html).toContain('data-pt-unresolved-type="button"');
  });

  test("command interact markup includes a search field and results", () => {
    const html = markup("command", "interact");
    expect(html).toMatch(/<input\b[^>]*type="search"/);
    expect(html).toContain("Open file");
  });
});
