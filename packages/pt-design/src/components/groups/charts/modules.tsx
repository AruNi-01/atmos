"use client";

import { catalogIdToXmlTag } from "../../../protocol";
import { CHART_IDS, CHART_META, type ChartId, type ChartMeta } from "../../../catalog/chart-list";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { ChartRenderer } from "./kit";
import { TITLE_FIELDS, ptNode } from "./node";

const CHART_BBOX = { width: 360, height: 300 };
const CHART_BBOX_WIDE = { width: 520, height: 340 };
const CHART_BBOX_ROUND = { width: 340, height: 320 };

function bboxFor(meta: ChartMeta): { width: number; height: number } {
  if (meta.marks.includes("interactive") && (meta.kind === "area" || meta.kind === "bar" || meta.kind === "line")) {
    return CHART_BBOX_WIDE;
  }
  if (meta.kind === "pie" || meta.kind === "radar" || meta.kind === "radial") return CHART_BBOX_ROUND;
  return CHART_BBOX;
}

function defaultOptions(meta: ChartMeta): { value: string; label: string }[] {
  if (meta.kind === "pie" || meta.kind === "radial") {
    const rows = [
      ["Chrome", "275,80"],
      ["Safari", "200,120"],
      ["Firefox", "187,90"],
      ["Edge", "173,70"],
      ["Other", "90,40"],
    ];
    return rows.map(([label, value]) => ({ label: label!, value: value! }));
  }
  if (meta.kind === "radar") {
    return [
      { label: "Desktop", value: "186,80" },
      { label: "Mobile", value: "305,200" },
      { label: "Tablet", value: "237,120" },
      { label: "Watch", value: "73,190" },
      { label: "TV", value: "209,130" },
      { label: "Other", value: "214,140" },
    ];
  }
  if (meta.marks.includes("mixed")) {
    return [
      { label: "Running", value: "186" },
      { label: "Swimming", value: "305" },
      { label: "Cycling", value: "237" },
      { label: "Yoga", value: "73" },
    ];
  }
  if (meta.marks.includes("negative")) {
    return [
      { label: "Page A", value: "186" },
      { label: "Page B", value: "-12" },
      { label: "Page C", value: "73" },
      { label: "Page D", value: "-45" },
      { label: "Page E", value: "209" },
    ];
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const desktop = [186, 305, 237, 73, 209, 214];
  const mobile = [80, 200, 120, 190, 130, 140];
  return months.map((label, i) => ({
    label,
    value: meta.series > 1 ? `${desktop[i]},${mobile[i]}` : String(desktop[i]),
  }));
}

function xmlExampleFor(meta: ChartMeta): string {
  const tag = catalogIdToXmlTag(meta.id);
  const box = bboxFor(meta);
  const options = defaultOptions(meta)
    .map((option) => `  <option value="${option.value}">${option.label}</option>`)
    .join("\n");
  return `<${tag} id="chart" title="${meta.title}" description="${meta.description}" x="0" y="0" width="${box.width}" height="${box.height}">
${options}
</${tag}>`;
}

function makeModule(meta: ChartMeta): PtComponentModule {
  const box = bboxFor(meta);
  return {
    type: meta.id,
    defaultBBox: box,
    defaultNode: (id) =>
      ptNode(id, meta.id, box, {
        props: { title: meta.title, description: meta.description, footer: meta.footer },
        options: defaultOptions(meta),
      }),
    Renderer: (props: PtRendererProps) => <ChartRenderer {...props} meta={meta} />,
    agentDescription: `Sketch ${meta.title}. Option values are numeric series (comma-separated for multiple series).`,
    xmlExample: xmlExampleFor(meta),
    inspectorFields: TITLE_FIELDS,
  };
}

const BY_ID = new Map(CHART_META.map((meta) => [meta.id, makeModule(meta)]));

export const CHART_MODULES: readonly PtComponentModule[] = CHART_IDS.map((id) => {
  const mod = BY_ID.get(id);
  if (!mod) throw new Error(`Missing chart module for ${id}`);
  return mod;
});

export function chartModule(id: ChartId): PtComponentModule {
  const mod = BY_ID.get(id);
  if (!mod) throw new Error(`Unknown chart id: ${id}`);
  return mod;
}