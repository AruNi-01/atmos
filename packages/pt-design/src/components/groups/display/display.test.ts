import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePtx, serializePtx } from "../../../protocol";
import { DISPLAY_MODULES } from "./index";
import type { PtComponentModule } from "./contract";

const TYPES = [
  "accordion",
  "alert",
  "aspect-ratio",
  "attachment",
  "avatar",
  "badge",
  "breadcrumb",
  "bubble",
  "card",
  "carousel",
  "chart",
  "collapsible",
  "data-table",
  "direction",
  "empty",
  "item",
  "kbd",
  "marker",
  "message",
  "message-scroller",
  "pagination",
  "progress",
  "questionnaire",
  "resizable",
  "scroll-area",
  "separator",
  "sidebar",
  "skeleton",
  "spinner",
  "table",
  "tabs",
  "typography",
] as const;

function moduleOf(type: (typeof TYPES)[number]): PtComponentModule {
  const mod = DISPLAY_MODULES.find((item) => item.type === type);
  if (!mod) throw new Error(`missing display module ${type}`);
  return mod;
}

function markup(mod: PtComponentModule, mode: "edit" | "interact"): string {
  return renderToStaticMarkup(
    createElement(mod.Renderer, {
      node: mod.defaultNode("n"),
      mode,
      onCommit: () => {},
    }),
  );
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

describe("DISPLAY_MODULES", () => {
  test("type set is the 32 display catalog ids with no duplicates", () => {
    const types = DISPLAY_MODULES.map((mod) => mod.type);
    expect(types).toHaveLength(32);
    expect(new Set(types).size).toBe(32);
    expect(new Set(types)).toEqual(new Set(TYPES));
    expect(DISPLAY_MODULES).toHaveLength(TYPES.length);
  });

  test("each defaultNode wraps in a page and parsePtx succeeds with the right type", () => {
    for (const mod of DISPLAY_MODULES) {
      const node = mod.defaultNode("n1");
      expect(node.id).toBe("n1");
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.rotation).toBe(0);
      expect(node.width).toBe(mod.defaultBBox.width);
      expect(node.height).toBe(mod.defaultBBox.height);
      const xml = serializePtx({ version: "ptx/1", pages: [{ id: "p", nodes: [node] }] });
      const doc = parsePtx(xml);
      expect(doc.pages[0]?.nodes[0]?.type).toBe(mod.type);
      expect(doc.pages[0]?.nodes[0]?.id).toBe("n1");
    }
  });
});

describe("Interact markup", () => {
  test("chart renders an svg chart, not an image placeholder", () => {
    const html = markup(moduleOf("chart"), "interact");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  test("table and data-table render a real table element", () => {
    expect(markup(moduleOf("table"), "interact")).toContain("<table");
    expect(markup(moduleOf("data-table"), "interact")).toContain("<table");
  });

  test("tabs interact markup includes clickable tab items", () => {
    const html = markup(moduleOf("tabs"), "interact");
    expect(html).toMatch(/role="tab"/);
    expect(html).toMatch(/<button\b/);
  });

  test("edit mode roots are inert and ignore pointer events", () => {
    const html = markup(moduleOf("card"), "edit");
    expect(html).toMatch(/\binert\b/);
    expect(html).toMatch(/pointer-events:\s*none/);
  });
});

describe("display group sources", () => {
  test("do not portal to the document body", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const hits: string[] = [];
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("createPortal") || text.includes("document.body")) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
