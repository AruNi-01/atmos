import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePtx, serializePtx } from "../../../protocol";
import { FORM_MODULES } from "./index";
import type { PtComponentModule } from "./contract";

const dir = dirname(fileURLToPath(import.meta.url));

const REQUIRED_TYPES = [
  "button",
  "button-group",
  "checkbox",
  "combobox",
  "date-picker",
  "field",
  "form",
  "input",
  "input-group",
  "input-otp",
  "label",
  "native-select",
  "radio-group",
  "select",
  "slider",
  "switch",
  "textarea",
  "toggle",
  "toggle-group",
  "calendar",
] as const;

const FORM_TYPES = new Set<string>(REQUIRED_TYPES);

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

describe("FORM_MODULES", () => {
  test("type set is the 20 form catalog ids with no duplicates", () => {
    const types = FORM_MODULES.map((mod) => mod.type);
    expect(types).toHaveLength(20);
    expect(new Set(types).size).toBe(20);
    expect(new Set(types)).toEqual(new Set(REQUIRED_TYPES));
    expect(FORM_MODULES).toHaveLength(REQUIRED_TYPES.length);
  });

  test("each defaultNode wraps in a page and parsePtx succeeds with the right type", () => {
    for (const mod of FORM_MODULES) {
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

  test("select/combobox/native-select defaults include at least two options", () => {
    for (const type of ["select", "combobox", "native-select", "radio-group"] as const) {
      const mod = FORM_MODULES.find((item) => item.type === type);
      expect(mod, type).toBeDefined();
      expect((mod!.defaultNode("x").options ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  test("switch/checkbox/toggle defaults have boolean checked", () => {
    for (const type of ["switch", "checkbox", "toggle"] as const) {
      const mod = FORM_MODULES.find((item) => item.type === type);
      expect(typeof mod!.defaultNode("x").checked).toBe("boolean");
    }
  });

  test("composed defaults nest at least one form-group child", () => {
    for (const type of ["form", "field", "button-group", "input-group"] as const) {
      const mod = FORM_MODULES.find((item) => item.type === type);
      const children = mod!.defaultNode("x").children ?? [];
      expect(children.length).toBeGreaterThanOrEqual(1);
      for (const child of children) {
        expect(FORM_TYPES.has(child.type)).toBe(true);
      }
    }
  });
});

describe("Interact markup", () => {
  test("S29 / S5 select uses an in-tree listbox and not a native select element", () => {
    const select = FORM_MODULES.find((mod) => mod.type === "select")!;
    const html = markup(select, "interact");
    expect(html).not.toContain("<select");
    expect(html).toMatch(/role="listbox"|role='listbox'/);
  });

  test("combobox and native-select also avoid native select", () => {
    for (const type of ["combobox", "native-select"] as const) {
      const mod = FORM_MODULES.find((item) => item.type === type)!;
      const html = markup(mod, "interact");
      expect(html, type).not.toContain("<select");
      expect(html, type).toMatch(/role="listbox"|role='listbox'/);
    }
  });

  test("switch exposes role=switch", () => {
    const sw = FORM_MODULES.find((mod) => mod.type === "switch")!;
    const html = markup(sw, "interact");
    expect(html).toMatch(/role="switch"|role='switch'/);
  });

  test("form tree renders nested form controls, not unresolved placeholders", () => {
    const form = FORM_MODULES.find((mod) => mod.type === "form")!;
    const html = markup(form, "interact");
    expect(html).not.toContain("data-pt-unresolved-type");
    expect(html).toContain("<input");
    expect(html).toContain("<button");
  });

  test("edit mode roots are inert and ignore pointer events", () => {
    const button = FORM_MODULES.find((mod) => mod.type === "button")!;
    const html = markup(button, "edit");
    expect(html).toMatch(/\binert\b/);
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("data-pt-artist");
    const src = readFileSync(join(dir, "controls.tsx"), "utf8");
    expect(src).toContain("ArtistInkHost");
    expect(src.match(/<ArtistInkHost/g)?.length).toBe(1);
  });
});

describe("form group sources", () => {
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
