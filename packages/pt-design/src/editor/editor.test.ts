import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { listComponentTypes } from "../components/registry";
import { ModeToggle } from "./ModeToggle";
import {
  Palette,
  buildPaletteMenuItems,
  catalogLabel,
  searchPaletteEntries,
} from "./Palette";

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

describe("ModeToggle", () => {
  test("S24 ModeToggle shows Edit / Interact in sentence case", () => {
    const html = renderToStaticMarkup(
      createElement(ModeToggle, { mode: "edit", onModeChange: () => {} }),
    );
    expect(html).toContain("data-testid=\"pt-design-mode\"");
    expect(html).toContain("pt-design-mode-toggle");
    expect(html).toContain("aria-label=\"Edit\"");
    expect(html).toContain("aria-label=\"Interact\"");
    expect(html).toContain("title=\"Edit\"");
    expect(html).toContain("title=\"Interact\"");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Interact<");
    expect(html).not.toContain("EDIT");
    expect(html).not.toContain("INTERACT");
    expect(html).not.toContain("uppercase");
    expect(html).not.toContain("text-transform");
  });

  test("ModeToggle uses host labels when provided", () => {
    const html = renderToStaticMarkup(
      createElement(ModeToggle, {
        mode: "interact",
        onModeChange: () => {},
        labels: { edit: "编辑", interact: "交互" },
      }),
    );
    expect(html).toContain("aria-label=\"编辑\"");
    expect(html).toContain("aria-label=\"交互\"");
    expect(html).toContain("aria-pressed=\"true\"");
  });
});

describe("Palette", () => {
  test("catalogLabel uses sentence case and strips block prefix", () => {
    expect(catalogLabel("alert-dialog")).toBe("Alert dialog");
    expect(catalogLabel("block.auth-form")).toBe("Auth form");
    expect(catalogLabel("button")).toBe("Button");
  });
  test("lists listComponentTypes and does not use the old wireframe catalog", () => {
    const html = renderToStaticMarkup(createElement(Palette, { onInsert: () => {} }));
    expect(html).toContain("data-testid=\"motion-slide-menu\"");
    expect(html).toContain("pt-design-catalog-search");
    for (const type of listComponentTypes()) {
      expect(html).toContain(`data-menu-id="${type}"`);
    }
    const src = readFileSync(join(dir, "Palette.tsx"), "utf8");
    expect(src).toContain("listComponentTypes");
    expect(src).not.toContain("ComponentCatalog");
    expect(src).not.toContain("catalog/templates");
    expect(src).not.toContain("catalog/registry");
  });

  test("renders a labeled row per type instead of concatenated ids", () => {
    const html = renderToStaticMarkup(createElement(Palette, { onInsert: () => {} }));
    expect(html).toContain("data-testid=\"pt-design-catalog\"");
    expect(html).toContain("Alert dialog");
    expect(html).toContain("Auth form");
    expect(html).not.toContain("accordionalert");
    expect(html).toContain("Button");
  });

  test("variant types open a second-level slide menu", () => {
    const placed: Array<{ type: string; variant?: string }> = [];
    const menu = buildPaletteMenuItems(listComponentTypes(), (type, variant) => {
      placed.push({ type, variant });
    });
    const button = menu.find((item) => item.id === "button");
    const input = menu.find((item) => item.id === "input");
    const dropdown = menu.find((item) => item.id === "dropdown-menu");
    const auth = menu.find((item) => item.id === "block.auth-form");
    expect(button?.label).toBe("Button");
    expect(button?.children?.map((child) => child.label)).toEqual([
      "All",
      "Default",
      "Secondary",
      "Outline",
      "Ghost",
      "Destructive",
      "Link",
    ]);
    expect(dropdown?.children?.map((child) => child.label)).toEqual(["All", "Trigger", "Open"]);
    expect(input?.children).toBeUndefined();
    expect(auth?.label).toBe("Auth form");
    expect(auth?.children).toBeUndefined();
    const outline = button?.children?.find((child) => child.id === "button::outline");
    outline?.onSelect?.(outline);
    expect(placed).toEqual([{ type: "button", variant: "outline" }]);
  });

  test("catalog search matches parents and auto-expands their variants", () => {
    const button = searchPaletteEntries(listComponentTypes(), "button").find(
      (group) => group.type === "button",
    );
    expect(button?.parentMatched).toBe(true);
    expect(button?.variants).toEqual(["default", "secondary", "outline", "ghost", "destructive", "link"]);
  });

  test("catalog search finds second-level variants without opening the parent name", () => {
    const hits = searchPaletteEntries(listComponentTypes(), "outline");
    expect(hits.every((group) => group.parentMatched === false)).toBe(true);
    expect(hits.map((group) => group.type).sort()).toEqual(["badge", "button", "toggle"]);
    expect(hits.every((group) => group.variants.includes("outline") && group.variants.length === 1)).toBe(
      true,
    );
  });

  test("catalog search is empty when nothing matches", () => {
    expect(searchPaletteEntries(listComponentTypes(), "zzzz-not-a-component")).toEqual([]);
  });
});

describe("editor sources", () => {
  test("do not import Excalidraw", () => {
    const hits: string[] = [];
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("@excalidraw/excalidraw")) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
