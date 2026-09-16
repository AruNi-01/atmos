import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHART_GROUPS, CHART_IDS, CHART_META, chartMeta, chartVariantLabel } from "../../../catalog/chart-list";
import { parsePtx, serializePtx } from "../../../protocol";
import { CHART_MODULES } from "./index";
import type { PtComponentModule } from "./contract";

const dir = dirname(fileURLToPath(import.meta.url));

function markup(mod: PtComponentModule, mode: "edit" | "interact"): string {
  return renderToStaticMarkup(
    createElement(mod.Renderer, {
      node: mod.defaultNode("n"),
      mode,
      onCommit: () => {},
    }),
  );
}

function walk(root: string, files: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) files.push(p);
  }
  return files;
}

describe("CHART_MODULES", () => {
  test("covers all 70 shadcn gallery charts with unique ids", () => {
    expect(CHART_IDS).toHaveLength(70);
    expect(CHART_META).toHaveLength(70);
    expect(CHART_MODULES).toHaveLength(70);
    expect(new Set(CHART_IDS).size).toBe(70);
    expect(CHART_MODULES.map((mod) => mod.type)).toEqual([...CHART_IDS]);
    expect(CHART_GROUPS.map((group) => group.label)).toEqual([
      "Area Charts",
      "Bar Charts",
      "Line Charts",
      "Pie Charts",
      "Radar Charts",
      "Radial Charts",
      "Tooltips",
    ]);
    expect(CHART_GROUPS.map((group) => group.ids.length)).toEqual([10, 10, 10, 11, 14, 6, 9]);
    expect(chartVariantLabel("chart.area-default")).toBe("Default");
    expect(chartVariantLabel("chart.area-linear")).toBe("Linear");
    expect(CHART_IDS.map(chartVariantLabel).some((label) => label.includes("-"))).toBe(false);
    const marksByKind = new Map<string, string[]>();
    for (const meta of CHART_META) {
      const key = meta.marks.join("|");
      const list = marksByKind.get(meta.kind) ?? [];
      expect(list).not.toContain(key);
      list.push(key);
      marksByKind.set(meta.kind, list);
    }
  });

  test("each defaultNode round-trips through PTX with dashed tags", () => {
    for (const mod of CHART_MODULES) {
      const node = mod.defaultNode("n1");
      expect(node.type).toBe(mod.type);
      expect(node.width).toBe(mod.defaultBBox.width);
      expect(node.height).toBe(mod.defaultBBox.height);
      const xml = serializePtx({ version: "ptx/1", pages: [{ id: "p", nodes: [node] }] });
      expect(xml).toContain(`<${mod.type.replaceAll(".", "-")} `);
      expect(xml).not.toContain(`<${mod.type} `);
      const doc = parsePtx(xml);
      expect(doc.pages[0]?.nodes[0]?.type).toBe(mod.type);
    }
  });

  test("each chart renders a distinctive sketch svg, not recharts", () => {
    const htmlById = new Map<string, string>();
    for (const mod of CHART_MODULES) {
      const html = markup(mod, "interact");
      const meta = chartMeta(mod.type as (typeof CHART_IDS)[number]);
      expect(html).toContain("<svg");
      expect(html).toContain(`data-pt-chart-id="${meta.id}"`);
      expect(html).toContain(`data-pt-chart-kind="${meta.kind}"`);
      expect(html).toContain(`data-pt-chart-marks="${meta.marks.join(" ")}"`);
      expect(html).toContain(meta.title);
      expect(html).toContain("border-radius:var(--pt-radius, 3px)");
      expect(html).not.toContain("recharts");
      expect(html).not.toContain("<img");
      expect(html).not.toMatch(/>[A-Z]{4,}</);
      htmlById.set(mod.type, html);
    }
    expect(new Set(htmlById.values()).size).toBe(70);
    const fingerprints = [...htmlById.entries()].map(([id, html]) => {
      const fingerprint = html
        .replace(/data-pt-chart-id="[^"]*"/g, "")
        .replace(/data-pt-type="[^"]*"/g, "")
        .replace(/data-pt-chart-marks="[^"]*"/g, "")
        .replace(/aria-label="[^"]*"/g, "")
        .replace(/id="chart-[^"]*"/g, 'id="gid"')
        .replace(/url\(#chart-[^)]*\)/g, "url(#gid)")
        .replace(/<div data-pt-text="[^"]*"[^>]*>[^<]*<\/div>/g, "")
        .replace(/<div style="font-size:13px[^"]*">[^<]*<\/div>/g, "")
        .replace(/<div style="font-size:11px;color:[^"]*">[^<]*<\/div>/g, "");
      return [id, fingerprint] as const;
    });
    const dupes = new Map<string, string[]>();
    for (const [id, fingerprint] of fingerprints) {
      const list = dupes.get(fingerprint) ?? [];
      list.push(id);
      dupes.set(fingerprint, list);
    }
    const collisions = [...dupes.values()].filter((ids) => ids.length > 1);
    expect(collisions).toEqual([]);
  });

  test("must-distinct flags change geometry or tooltip chrome", () => {
    const html = (id: (typeof CHART_IDS)[number]) => markup(
      CHART_MODULES.find((mod) => mod.type === id)!,
      "interact",
    );
    const svg = (id: (typeof CHART_IDS)[number]) => html(id).match(/<svg[\s\S]*<\/svg>/)?.[0] ?? "";
    expect(svg("chart.area-stacked")).not.toBe(svg("chart.area-stacked-expand"));
    expect(svg("chart.area-linear")).not.toBe(svg("chart.area-step"));
    expect(svg("chart.area-default")).not.toBe(svg("chart.area-linear"));
    expect(svg("chart.pie-simple")).not.toBe(svg("chart.pie-donut"));
    expect(svg("chart.pie-label")).not.toBe(svg("chart.pie-label-list"));
    expect(svg("chart.pie-label-list")).toContain("data-pt-chart-label-list");
    expect(svg("chart.pie-label")).toContain("data-pt-chart-label-outside");
    expect(svg("chart.bar-negative")).not.toBe(svg("chart.bar-default"));
    expect(svg("chart.bar-active")).toContain("-hatch");
    expect(svg("chart.radar-default")).not.toBe(svg("chart.radar-grid-circle"));
    expect(svg("chart.radar-grid-circle")).not.toBe(svg("chart.radar-grid-circle-no-lines"));
    expect(svg("chart.radar-grid-none")).not.toBe(svg("chart.radar-default"));
    expect(svg("chart.radar-grid-fill")).not.toBe(svg("chart.radar-default"));
    expect(svg("chart.radar-grid-circle-fill")).not.toBe(svg("chart.radar-grid-circle"));
    expect(svg("chart.radial-shape")).not.toBe(svg("chart.radial-simple"));
    expect(svg("chart.radial-stacked")).not.toBe(svg("chart.radial-simple"));
    expect(html("chart.tooltip-default")).toContain('data-pt-chart-indicator="dot"');
    expect(html("chart.tooltip-indicator-line")).toContain('data-pt-chart-indicator="line"');
    expect(html("chart.tooltip-indicator-line")).toContain("data-pt-chart-hover-line");
    expect(html("chart.tooltip-default")).not.toContain("data-pt-chart-hover-line");
    expect(html("chart.tooltip-indicator-none")).toContain('data-pt-chart-indicator="none"');
    expect(html("chart.tooltip-label-custom")).toContain("Activity");
    expect(html("chart.tooltip-label-formatter")).toContain("Feb 2024");
    expect(html("chart.tooltip-formatter")).toContain(" visitors");
    expect(html("chart.tooltip-advanced")).toContain("Total ");
    expect(html("chart.tooltip-icons")).toMatch(/width:10px;height:10px/);
    expect(html("chart.area-interactive")).toContain("data-pt-chart-interactive");
    expect(html("chart.area-interactive")).toContain("3 months");
    expect(html("chart.area-interactive")).toContain("7 days");
    expect(html("chart.pie-interactive")).toContain('data-pt-chart-range="Chrome"');
    expect(html("chart.pie-interactive")).not.toContain('data-pt-chart-range="Jan"');
  });

  test("interactive charts expose range controls and tooltips expose tooltip chrome", () => {
    const interactive = CHART_MODULES.filter((mod) => String(mod.type).includes("interactive"));
    expect(interactive.length).toBe(4);
    for (const mod of interactive) {
      expect(markup(mod, "interact")).toContain("data-pt-chart-interactive");
    }
    const tooltips = CHART_MODULES.filter((mod) => String(mod.type).startsWith("chart.tooltip-"));
    expect(tooltips).toHaveLength(9);
    for (const mod of tooltips) {
      expect(markup(mod, "interact")).toContain("data-pt-chart-tooltip");
    }
  });

  test("edit mode roots are inert", () => {
    const html = markup(CHART_MODULES[1]!, "edit");
    expect(html).toMatch(/\binert\b/);
    expect(html).toMatch(/pointer-events:\s*none/);
  });

  test("copy fields are isolated from svg tick labels", () => {
    const html = markup(
      CHART_MODULES.find((mod) => mod.type === "chart.bar-default")!,
      "edit",
    );
    expect(html).toContain('data-pt-text="title"');
    expect(html).toContain('data-pt-text="description"');
    expect(html).toContain('data-pt-text="footer"');
    expect(html).toMatch(/data-pt-text="title"[^>]*>Bar Chart</);
    expect(html).toMatch(/data-pt-text="footer"[^>]*>Trending up by 5.2% this month</);
    expect(html).toContain(">Jan</text>");
    expect(html).not.toMatch(/data-pt-text="title"[^>]*>[^<]*Jan/);
  });
});

describe("chart group sources", () => {
  test("do not portal, import recharts, or leak host packages", () => {
    const hits: string[] = [];
    for (const file of walk(dir)) {
      const text = readFileSync(file, "utf8");
      if (
        text.includes("createPortal") ||
        text.includes("document.body") ||
        text.includes("recharts") ||
        text.includes("@workspace/ui") ||
        text.includes("@excalidraw/excalidraw")
      ) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
