import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePtx, serializePtx } from "../../../protocol";
import { FORM_MODULES } from "./index";
import type { PtComponentModule } from "./contract";
import { fireAgentActions } from "./runtime";

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

  test("palette buttons do not stamp Agent run events", () => {
    const button = FORM_MODULES.find((mod) => mod.type === "button")!.defaultNode("n");
    expect(button.events).toBeUndefined();
    const form = FORM_MODULES.find((mod) => mod.type === "form")!.defaultNode("n");
    expect(form.children?.find((child) => child.type === "button")?.events).toBeUndefined();
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

  test("calendar renders an inset panel, weekday row, and bordered day cells", () => {
    const calendar = FORM_MODULES.find((mod) => mod.type === "calendar")!;
    const html = markup(calendar, "interact");
    expect(html).toMatch(/role="grid"|role='grid'/);
    expect(html).toMatch(/data-pt-calendar-panel/);
    expect(html).toMatch(/data-pt-calendar-weekday/);
    expect(html).toMatch(/data-pt-calendar-day/);
    expect(html).toMatch(/border:\s*1\.5px solid/);
    expect(html).toMatch(/border:\s*1px solid/);
    expect(html).toContain("Su");
    expect(html).toContain("aria-selected");
    const src = readFileSync(join(dir, "calendar-ui.tsx"), "utf8");
    expect(src).toContain("onPick(iso)");
  });

  test("slider uses a bordered track and fill, not a naked range accent", () => {
    const slider = FORM_MODULES.find((mod) => mod.type === "slider")!;
    const html = markup(slider, "interact");
    expect(html).toMatch(/data-pt-slider-track/);
    expect(html).toMatch(/data-pt-slider-fill/);
    expect(html).toMatch(/data-pt-slider-thumb/);
    expect(html).toMatch(/border:\s*1\.5px solid/);
    expect(html).toMatch(/type="range"|type='range'/);
  });

  test("select listbox rows have padding and selected background; trigger stays borderless", () => {
    const select = FORM_MODULES.find((mod) => mod.type === "select")!;
    const html = markup(select, "interact");
    expect(html).toMatch(/role="listbox"|role='listbox'/);
    expect(html).toMatch(/data-pt-list-option/);
    expect(html).toMatch(/padding:\s*8px 10px/);
    expect(html).toMatch(/color-mix\(in srgb, var\(--pt-ink/);
    expect(html).toMatch(/border:\s*none/);
    expect(html).not.toContain("<select");
    const listSrc = readFileSync(join(dir, "listbox.tsx"), "utf8");
    expect(listSrc).toContain("onMouseEnter");
    expect(listSrc).toContain('border: "none"');
    expect(listSrc).not.toContain("createPortal");
  });

  test("button, input, select, and otp cells use the radius token", () => {
    for (const type of ["button", "input", "textarea", "select", "input-otp"] as const) {
      const mod = FORM_MODULES.find((item) => item.type === type)!;
      const html = markup(mod, "interact");
      expect(html, type).toContain("border-radius:var(--pt-radius, 3px)");
    }
    const fieldSrc = readFileSync(join(dir, "node.ts"), "utf8");
    expect(fieldSrc).toContain("borderRadius: SKETCH_RADIUS_CSS");
  });

  test("standalone input keeps FIELD border none", () => {
    const input = FORM_MODULES.find((mod) => mod.type === "input")!;
    const html = markup(input, "interact");
    expect(html).toMatch(/border:\s*none/);
    const fieldSrc = readFileSync(join(dir, "node.ts"), "utf8");
    expect(fieldSrc).toMatch(/export const FIELD: CSSProperties = \{[\s\S]*?border: "none"/);
  });

  test("Interact does not fire stale catalog Agent run on palette labels", () => {
    const labels = ["Button", "Continue", "Submit", "Create", "Home", "Settings"] as const;
    for (const label of labels) {
      const payloads: unknown[] = [];
      fireAgentActions(
        {
          id: "n",
          type: "button",
          props: { label },
          x: 0,
          y: 0,
          width: 120,
          height: 40,
          rotation: 0,
          events: [{ event: "click", actions: [{ type: "agent", name: "run" }] }],
        },
        "click",
        (payload) => payloads.push(payload),
      );
      expect(payloads, label).toEqual([]);
    }
  });

  test("explicit Run PTX still fires host Agent action", () => {
    const payloads: unknown[] = [];
    const node = parsePtx(`<page id="p">
  <button id="run" label="Run" x="0" y="0" width="100" height="40">
    <on event="click"><action type="agent" name="run"/></on>
  </button>
</page>`).pages[0]!.nodes[0]!;
    fireAgentActions(node, "click", (payload) => payloads.push(payload));
    expect(payloads).toEqual([
      { nodeId: "run", event: "click", action: { type: "agent", name: "run" } },
    ]);
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
