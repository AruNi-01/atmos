import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { REQUIRED_BLOCKS } from "../../../catalog/shadcn-list";
import { parsePtx, serializePtx } from "../../../protocol";
import { BLOCK_MODULES } from "./index";
import type { PtComponentModule } from "./contract";
import { patchChild } from "./runtime";

const FORM_OR_OVERLAY = new Set([
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
]);

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

function moduleOf(type: string): PtComponentModule {
  const mod = BLOCK_MODULES.find((item) => item.type === type);
  if (!mod) throw new Error(`missing block module ${type}`);
  return mod;
}

describe("BLOCK_MODULES", () => {
  test("type set is the 4 REQUIRED_BLOCKS ids with no duplicates", () => {
    const types = BLOCK_MODULES.map((mod) => mod.type);
    expect(types).toHaveLength(4);
    expect(new Set(types).size).toBe(4);
    expect(new Set(types)).toEqual(new Set(REQUIRED_BLOCKS));
    expect(BLOCK_MODULES).toHaveLength(REQUIRED_BLOCKS.length);
  });

  test("each defaultNode is a nested tree that parsePtx accepts", () => {
    for (const mod of BLOCK_MODULES) {
      const node = mod.defaultNode("n1");
      expect(node.id).toBe("n1");
      expect(node.type).toBe(mod.type);
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.rotation).toBe(0);
      expect(node.width).toBe(mod.defaultBBox.width);
      expect(node.height).toBe(mod.defaultBBox.height);
      expect((node.children ?? []).length).toBeGreaterThanOrEqual(1);
      for (const child of node.children ?? []) {
        expect(FORM_OR_OVERLAY.has(child.type)).toBe(true);
        expect(String(child.type).startsWith("block.")).toBe(false);
      }
      const xml = serializePtx({ version: "ptx/1", pages: [{ id: "p", nodes: [node] }] });
      const doc = parsePtx(xml);
      expect(doc.pages[0]?.nodes[0]?.type).toBe(mod.type);
      expect(doc.pages[0]?.nodes[0]?.id).toBe("n1");
      expect((doc.pages[0]?.nodes[0]?.children ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });

  test("serialize emits dashed block tags", () => {
    const xml = serializePtx({
      version: "ptx/1",
      pages: [
        {
          id: "p",
          nodes: BLOCK_MODULES.map((mod) => mod.defaultNode(mod.type.replaceAll(".", "-"))),
        },
      ],
    });
    expect(xml).toContain("<block-auth-form");
    expect(xml).toContain("<block-settings-shell");
    expect(xml).toContain("<block-empty-state");
    expect(xml).toContain("<block-nav-content");
  });

  test("auth-form nests input and button; interact markup renders both", () => {
    const auth = moduleOf("block.auth-form");
    const children = auth.defaultNode("login").children ?? [];
    const childTypes = new Set(children.map((child) => child.type));
    expect(childTypes.has("input")).toBe(true);
    expect(childTypes.has("button")).toBe(true);
    const html = markup(auth, "interact");
    expect(html).toContain("<input");
    expect(html).toContain("<button");
    expect(html).not.toContain("data-pt-unresolved-type");
    expect(html).toContain("Sign in");
  });
});

describe("Interact and edit", () => {
  test("edit mode roots are inert and ignore pointer events", () => {
    const html = markup(moduleOf("block.auth-form"), "edit");
    expect(html).toMatch(/\binert\b/);
    expect(html).toContain("pointer-events:none");
  });

  test("onCommit replaces a child by id without dropping the tree", () => {
    const node = moduleOf("block.auth-form").defaultNode("login");
    const next = patchChild(node.children, "login-email", { value: "a@b.com" });
    expect(next).toHaveLength(node.children!.length);
    expect(next.find((child) => child.id === "login-email")?.value).toBe("a@b.com");
    expect(next.find((child) => child.id === "login-password")?.type).toBe("input");
    expect(next.find((child) => child.id === "login-submit")?.type).toBe("button");
  });
});

describe("block group sources", () => {
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
