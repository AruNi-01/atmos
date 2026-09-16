/** Pinned from https://ui.shadcn.com/charts + docs/components/chart (2026-09). */

export const CHART_IDS = [
  "chart.area-interactive",
  "chart.area-default",
  "chart.area-linear",
  "chart.area-step",
  "chart.area-legend",
  "chart.area-stacked",
  "chart.area-stacked-expand",
  "chart.area-icons",
  "chart.area-gradient",
  "chart.area-axes",
  "chart.bar-interactive",
  "chart.bar-default",
  "chart.bar-horizontal",
  "chart.bar-multiple",
  "chart.bar-stacked",
  "chart.bar-label",
  "chart.bar-label-custom",
  "chart.bar-mixed",
  "chart.bar-active",
  "chart.bar-negative",
  "chart.line-interactive",
  "chart.line-default",
  "chart.line-linear",
  "chart.line-step",
  "chart.line-multiple",
  "chart.line-dots",
  "chart.line-dots-custom",
  "chart.line-dots-colors",
  "chart.line-label",
  "chart.line-label-custom",
  "chart.pie-simple",
  "chart.pie-separator-none",
  "chart.pie-label",
  "chart.pie-label-custom",
  "chart.pie-label-list",
  "chart.pie-legend",
  "chart.pie-donut",
  "chart.pie-donut-active",
  "chart.pie-donut-text",
  "chart.pie-stacked",
  "chart.pie-interactive",
  "chart.radar-default",
  "chart.radar-dots",
  "chart.radar-lines-only",
  "chart.radar-label-custom",
  "chart.radar-grid-custom",
  "chart.radar-grid-none",
  "chart.radar-grid-circle",
  "chart.radar-grid-circle-no-lines",
  "chart.radar-grid-circle-fill",
  "chart.radar-grid-fill",
  "chart.radar-multiple",
  "chart.radar-legend",
  "chart.radar-icons",
  "chart.radar-radius",
  "chart.radial-simple",
  "chart.radial-label",
  "chart.radial-grid",
  "chart.radial-text",
  "chart.radial-shape",
  "chart.radial-stacked",
  "chart.tooltip-default",
  "chart.tooltip-indicator-line",
  "chart.tooltip-indicator-none",
  "chart.tooltip-label-custom",
  "chart.tooltip-label-formatter",
  "chart.tooltip-label-none",
  "chart.tooltip-formatter",
  "chart.tooltip-icons",
  "chart.tooltip-advanced",
] as const;

export type ChartId = (typeof CHART_IDS)[number];

export type ChartKind = "area" | "bar" | "line" | "pie" | "radar" | "radial" | "tooltip";

export type ChartMeta = {
  id: ChartId;
  kind: ChartKind;
  title: string;
  description: string;
  footer: string;
  series: 1 | 2 | 3;
  marks: readonly string[];
};

const VISITORS = "Showing total visitors for the last 6 months";
const VISITORS_3M = "Showing total visitors for the last 3 months";
const TREND = "Trending up by 5.2% this month";

export const CHART_META: readonly ChartMeta[] = [
  { id: "chart.area-interactive", kind: "area", title: "Area Chart - Interactive", description: VISITORS_3M, footer: TREND, series: 2, marks: ["interactive", "stacked", "gradient"] },
  { id: "chart.area-default", kind: "area", title: "Area Chart", description: VISITORS, footer: TREND, series: 1, marks: ["curve-natural"] },
  { id: "chart.area-linear", kind: "area", title: "Area Chart - Linear", description: VISITORS, footer: TREND, series: 1, marks: ["curve-linear"] },
  { id: "chart.area-step", kind: "area", title: "Area Chart - Step", description: VISITORS, footer: TREND, series: 1, marks: ["curve-step"] },
  { id: "chart.area-legend", kind: "area", title: "Area Chart - Legend", description: VISITORS, footer: TREND, series: 2, marks: ["stacked", "legend"] },
  { id: "chart.area-stacked", kind: "area", title: "Area Chart - Stacked", description: VISITORS, footer: TREND, series: 2, marks: ["stacked"] },
  { id: "chart.area-stacked-expand", kind: "area", title: "Area Chart - Stacked Expanded", description: VISITORS, footer: TREND, series: 2, marks: ["stacked", "expand"] },
  { id: "chart.area-icons", kind: "area", title: "Area Chart - Icons", description: VISITORS, footer: TREND, series: 2, marks: ["stacked", "legend", "icons"] },
  { id: "chart.area-gradient", kind: "area", title: "Area Chart - Gradient", description: VISITORS, footer: TREND, series: 1, marks: ["gradient", "curve-natural"] },
  { id: "chart.area-axes", kind: "area", title: "Area Chart - Axes", description: VISITORS, footer: TREND, series: 1, marks: ["axes", "curve-natural"] },
  { id: "chart.bar-interactive", kind: "bar", title: "Bar Chart - Interactive", description: VISITORS_3M, footer: TREND, series: 2, marks: ["interactive", "stacked"] },
  { id: "chart.bar-default", kind: "bar", title: "Bar Chart", description: VISITORS, footer: TREND, series: 1, marks: ["vertical"] },
  { id: "chart.bar-horizontal", kind: "bar", title: "Bar Chart - Horizontal", description: VISITORS, footer: TREND, series: 1, marks: ["horizontal"] },
  { id: "chart.bar-multiple", kind: "bar", title: "Bar Chart - Multiple", description: VISITORS, footer: TREND, series: 2, marks: ["grouped"] },
  { id: "chart.bar-stacked", kind: "bar", title: "Bar Chart - Stacked", description: VISITORS, footer: TREND, series: 2, marks: ["stacked", "legend"] },
  { id: "chart.bar-label", kind: "bar", title: "Bar Chart - Label", description: VISITORS, footer: TREND, series: 1, marks: ["labels"] },
  { id: "chart.bar-label-custom", kind: "bar", title: "Bar Chart - Custom Label", description: VISITORS, footer: TREND, series: 1, marks: ["labels", "labels-custom"] },
  { id: "chart.bar-mixed", kind: "bar", title: "Bar Chart - Mixed", description: "Running, swimming, and other activity.", footer: TREND, series: 1, marks: ["horizontal", "mixed"] },
  { id: "chart.bar-active", kind: "bar", title: "Bar Chart - Active", description: VISITORS, footer: TREND, series: 1, marks: ["active"] },
  { id: "chart.bar-negative", kind: "bar", title: "Bar Chart - Negative", description: "Gains and losses by page.", footer: "January - June 2024", series: 1, marks: ["negative"] },
  { id: "chart.line-interactive", kind: "line", title: "Line Chart - Interactive", description: VISITORS_3M, footer: TREND, series: 1, marks: ["interactive", "curve-natural"] },
  { id: "chart.line-default", kind: "line", title: "Line Chart", description: VISITORS, footer: TREND, series: 1, marks: ["curve-natural"] },
  { id: "chart.line-linear", kind: "line", title: "Line Chart - Linear", description: VISITORS, footer: TREND, series: 1, marks: ["curve-linear"] },
  { id: "chart.line-step", kind: "line", title: "Line Chart - Step", description: VISITORS, footer: TREND, series: 1, marks: ["curve-step"] },
  { id: "chart.line-multiple", kind: "line", title: "Line Chart - Multiple", description: VISITORS, footer: TREND, series: 2, marks: ["multiple"] },
  { id: "chart.line-dots", kind: "line", title: "Line Chart - Dots", description: VISITORS, footer: TREND, series: 1, marks: ["dots"] },
  { id: "chart.line-dots-custom", kind: "line", title: "Line Chart - Custom Dots", description: VISITORS, footer: TREND, series: 1, marks: ["dots", "dots-custom"] },
  { id: "chart.line-dots-colors", kind: "line", title: "Line Chart - Dots Colors", description: VISITORS, footer: TREND, series: 1, marks: ["dots", "dots-colors"] },
  { id: "chart.line-label", kind: "line", title: "Line Chart - Label", description: VISITORS, footer: TREND, series: 1, marks: ["labels"] },
  { id: "chart.line-label-custom", kind: "line", title: "Line Chart - Custom Label", description: VISITORS, footer: TREND, series: 1, marks: ["labels", "labels-custom"] },
  { id: "chart.pie-simple", kind: "pie", title: "Pie Chart", description: "January - June 2024", footer: TREND, series: 1, marks: ["separator"] },
  { id: "chart.pie-separator-none", kind: "pie", title: "Pie Chart - Separator None", description: "January - June 2024", footer: TREND, series: 1, marks: ["separator-none"] },
  { id: "chart.pie-label", kind: "pie", title: "Pie Chart - Label", description: "January - June 2024", footer: TREND, series: 1, marks: ["labels"] },
  { id: "chart.pie-label-custom", kind: "pie", title: "Pie Chart - Custom Label", description: "January - June 2024", footer: TREND, series: 1, marks: ["labels", "labels-custom"] },
  { id: "chart.pie-label-list", kind: "pie", title: "Pie Chart - Label List", description: "January - June 2024", footer: TREND, series: 1, marks: ["labels", "label-list"] },
  { id: "chart.pie-legend", kind: "pie", title: "Pie Chart - Legend", description: "January - June 2024", footer: TREND, series: 1, marks: ["legend"] },
  { id: "chart.pie-donut", kind: "pie", title: "Pie Chart - Donut", description: "January - June 2024", footer: TREND, series: 1, marks: ["donut"] },
  { id: "chart.pie-donut-active", kind: "pie", title: "Pie Chart - Donut Active", description: "January - June 2024", footer: TREND, series: 1, marks: ["donut", "active"] },
  { id: "chart.pie-donut-text", kind: "pie", title: "Pie Chart - Donut with Text", description: "January - June 2024", footer: TREND, series: 1, marks: ["donut", "center-text"] },
  { id: "chart.pie-stacked", kind: "pie", title: "Pie Chart - Stacked", description: "January - June 2024", footer: TREND, series: 2, marks: ["donut", "stacked"] },
  { id: "chart.pie-interactive", kind: "pie", title: "Pie Chart - Interactive", description: "January - June 2024", footer: TREND, series: 1, marks: ["donut", "interactive", "center-text"] },
  { id: "chart.radar-default", kind: "radar", title: "Radar Chart", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-polygon", "fill"] },
  { id: "chart.radar-dots", kind: "radar", title: "Radar Chart - Dots", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-polygon", "fill", "dots"] },
  { id: "chart.radar-lines-only", kind: "radar", title: "Radar Chart - Lines Only", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-polygon", "lines-only"] },
  { id: "chart.radar-label-custom", kind: "radar", title: "Radar Chart - Custom Label", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-polygon", "fill", "labels-custom"] },
  { id: "chart.radar-grid-custom", kind: "radar", title: "Radar Chart - Custom Grid", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-custom", "fill"] },
  { id: "chart.radar-grid-none", kind: "radar", title: "Radar Chart - Grid None", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-none", "fill"] },
  { id: "chart.radar-grid-circle", kind: "radar", title: "Radar Chart - Grid Circle", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-circle", "fill"] },
  { id: "chart.radar-grid-circle-no-lines", kind: "radar", title: "Radar Chart - Grid Circle No Lines", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-circle", "no-radial", "fill"] },
  { id: "chart.radar-grid-circle-fill", kind: "radar", title: "Radar Chart - Grid Circle Filled", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-circle", "grid-fill", "fill"] },
  { id: "chart.radar-grid-fill", kind: "radar", title: "Radar Chart - Grid Filled", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-polygon", "grid-fill", "fill"] },
  { id: "chart.radar-multiple", kind: "radar", title: "Radar Chart - Multiple", description: "January - June 2024", footer: TREND, series: 2, marks: ["grid-polygon", "fill", "multiple"] },
  { id: "chart.radar-legend", kind: "radar", title: "Radar Chart - Legend", description: "January - June 2024", footer: TREND, series: 2, marks: ["grid-polygon", "fill", "legend"] },
  { id: "chart.radar-icons", kind: "radar", title: "Radar Chart - Icons", description: "January - June 2024", footer: TREND, series: 2, marks: ["grid-polygon", "fill", "legend", "icons"] },
  { id: "chart.radar-radius", kind: "radar", title: "Radar Chart - Radius", description: "January - June 2024", footer: TREND, series: 1, marks: ["grid-polygon", "fill", "radius-ticks"] },
  { id: "chart.radial-simple", kind: "radial", title: "Radial Chart", description: "January - June 2024", footer: TREND, series: 1, marks: ["arcs"] },
  { id: "chart.radial-label", kind: "radial", title: "Radial Chart - Label", description: "January - June 2024", footer: TREND, series: 1, marks: ["arcs", "labels"] },
  { id: "chart.radial-grid", kind: "radial", title: "Radial Chart - Grid", description: "January - June 2024", footer: TREND, series: 1, marks: ["arcs", "grid"] },
  { id: "chart.radial-text", kind: "radial", title: "Radial Chart - Text", description: "January - June 2024", footer: TREND, series: 1, marks: ["arcs", "center-text"] },
  { id: "chart.radial-shape", kind: "radial", title: "Radial Chart - Shape", description: "January - June 2024", footer: TREND, series: 1, marks: ["arcs", "shape"] },
  { id: "chart.radial-stacked", kind: "radial", title: "Radial Chart - Stacked", description: "January - June 2024", footer: TREND, series: 2, marks: ["arcs", "stacked", "center-text"] },
  { id: "chart.tooltip-default", kind: "tooltip", title: "Tooltip - Default", description: "Tooltip with default indicator.", footer: "January - June 2024", series: 2, marks: ["stacked", "indicator-dot"] },
  { id: "chart.tooltip-indicator-line", kind: "tooltip", title: "Tooltip - Line Indicator", description: "Tooltip with a line indicator.", footer: "January - June 2024", series: 2, marks: ["stacked", "indicator-line"] },
  { id: "chart.tooltip-indicator-none", kind: "tooltip", title: "Tooltip - No Indicator", description: "Tooltip without an indicator.", footer: "January - June 2024", series: 2, marks: ["stacked", "indicator-none"] },
  { id: "chart.tooltip-label-custom", kind: "tooltip", title: "Tooltip - Custom Label", description: "Tooltip with a custom label.", footer: "January - June 2024", series: 2, marks: ["stacked", "label-custom"] },
  { id: "chart.tooltip-label-formatter", kind: "tooltip", title: "Tooltip - Label Formatter", description: "Tooltip with a formatted label.", footer: "January - June 2024", series: 2, marks: ["stacked", "label-formatter"] },
  { id: "chart.tooltip-label-none", kind: "tooltip", title: "Tooltip - No Label", description: "Tooltip without a label.", footer: "January - June 2024", series: 2, marks: ["stacked", "label-none"] },
  { id: "chart.tooltip-formatter", kind: "tooltip", title: "Tooltip - Formatter", description: "Tooltip with a custom formatter.", footer: "January - June 2024", series: 2, marks: ["stacked", "formatter"] },
  { id: "chart.tooltip-icons", kind: "tooltip", title: "Tooltip - Icons", description: "Tooltip with icons.", footer: "January - June 2024", series: 2, marks: ["stacked", "icons"] },
  { id: "chart.tooltip-advanced", kind: "tooltip", title: "Tooltip - Advanced", description: "Tooltip with extra rows.", footer: "January - June 2024", series: 3, marks: ["stacked", "advanced"] },
];

export const CHART_GROUPS = [
  { id: "area" as const, label: "Area Charts", ids: CHART_IDS.filter((id) => id.startsWith("chart.area-")) },
  { id: "bar" as const, label: "Bar Charts", ids: CHART_IDS.filter((id) => id.startsWith("chart.bar-")) },
  { id: "line" as const, label: "Line Charts", ids: CHART_IDS.filter((id) => id.startsWith("chart.line-")) },
  { id: "pie" as const, label: "Pie Charts", ids: CHART_IDS.filter((id) => id.startsWith("chart.pie-")) },
  { id: "radar" as const, label: "Radar Charts", ids: CHART_IDS.filter((id) => id.startsWith("chart.radar-")) },
  { id: "radial" as const, label: "Radial Charts", ids: CHART_IDS.filter((id) => id.startsWith("chart.radial-")) },
  { id: "tooltip" as const, label: "Tooltips", ids: CHART_IDS.filter((id) => id.startsWith("chart.tooltip-")) },
];

const META_BY_ID = new Map(CHART_META.map((meta) => [meta.id, meta]));

export function chartMeta(id: ChartId): ChartMeta {
  const meta = META_BY_ID.get(id);
  if (!meta) throw new Error(`Unknown chart id: ${id}`);
  return meta;
}

export function isChartId(value: string): value is ChartId {
  return META_BY_ID.has(value as ChartId);
}

/** Second-level palette label: `chart.area-linear` → `Linear`, not `area-linear`. */
export function chartVariantLabel(id: ChartId): string {
  const rest = id.slice(`chart.${chartMeta(id).kind}-`.length);
  const parts = rest.split("-").filter(Boolean);
  if (parts.length === 0) return id;
  return parts
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}
