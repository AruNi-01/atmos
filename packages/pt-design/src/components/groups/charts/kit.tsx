"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import type { ChartMeta } from "../../../catalog/chart-list";
import type { PtNode } from "../../../protocol";
import type { PtRendererProps } from "./contract";
import { FILL, FONT, T } from "./node";
import { ControlRoot, propText } from "./runtime";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const DESKTOP = [186, 305, 237, 73, 209, 214];
const MOBILE = [80, 200, 120, 190, 130, 140];
const OTHER = [40, 55, 45, 30, 50, 42];
const PIE_LABELS = ["Chrome", "Safari", "Firefox", "Edge", "Other"];
const PIE_VALUES = [275, 200, 187, 173, 90];
const RADAR_LABELS = ["Desktop", "Mobile", "Tablet", "Watch", "TV", "Other"];
const MIXED_LABELS = ["Running", "Swimming", "Cycling", "Yoga"];
const MIXED_VALUES = [186, 305, 237, 73];
const NEG_LABELS = ["Page A", "Page B", "Page C", "Page D", "Page E"];
const NEG_VALUES = [186, -12, 73, -45, 209];

type Series = { labels: string[]; values: number[][] };

function has(meta: ChartMeta, mark: string): boolean {
  return meta.marks.includes(mark);
}

function parseSeries(node: PtNode, count: number, fallbackLabels: readonly string[], fallback: number[][]): Series {
  const options = node.options;
  if (!options || options.length === 0) {
    return { labels: [...fallbackLabels], values: fallback.slice(0, count).map((row) => [...row]) };
  }
  const labels = options.map((option) => option.label);
  const values: number[][] = Array.from({ length: count }, () => []);
  for (const option of options) {
    const parts = String(option.value)
      .split(/[,/]/)
      .map((part) => Number(part));
    for (let i = 0; i < count; i++) {
      const parsed = parts[i];
      const base = Number.isFinite(parts[0]) ? parts[0]! : 0;
      values[i]!.push(Number.isFinite(parsed) ? parsed! : Math.round(base * (1 - i * 0.42)));
    }
  }
  return { labels, values };
}

function cartesian(node: PtNode, meta: ChartMeta, extra?: { labels?: readonly string[]; values?: number[][] }): Series {
  const labels = extra?.labels ?? MONTHS;
  const values = extra?.values ?? [DESKTOP, MOBILE, OTHER];
  return parseSeries(node, meta.series, labels, values);
}

const RANGE_3M = "Last 3 months";
const RANGE_30D = "Last 30 days";
const RANGE_7D = "Last 7 days";
const CARTESIAN_RANGES = [RANGE_3M, RANGE_30D, RANGE_7D] as const;

function sliceSeries(series: Series, range: string): Series {
  const count = range === RANGE_7D ? 3 : range === RANGE_30D ? 4 : null;
  if (!count || count >= series.labels.length) return series;
  return {
    labels: series.labels.slice(-count),
    values: series.values.map((row) => row.slice(-count)),
  };
}

function curveOf(meta: ChartMeta): "natural" | "linear" | "step" {
  if (has(meta, "curve-step")) return "step";
  if (has(meta, "curve-linear")) return "linear";
  return "natural";
}

function linePath(points: { x: number; y: number }[], curve: "natural" | "linear" | "step"): string {
  if (points.length === 0) return "";
  if (curve === "step") {
    let d = `M ${points[0]!.x} ${points[0]!.y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i]!.x} ${points[i - 1]!.y} L ${points[i]!.x} ${points[i]!.y}`;
    }
    return d;
  }
  if (curve === "linear") {
    return `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
  }
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function closeArea(points: { x: number; y: number }[], baseline: number, curve: "natural" | "linear" | "step"): string {
  if (points.length === 0) return "";
  return `${linePath(points, curve)} L ${points[points.length - 1]!.x} ${baseline} L ${points[0]!.x} ${baseline} Z`;
}

function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

function arcPath(cx: number, cy: number, r: number, inner: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const s1 = polar(cx, cy, r, start);
  const e1 = polar(cx, cy, r, end);
  if (inner <= 0) {
    return `M ${cx} ${cy} L ${s1.x} ${s1.y} A ${r} ${r} 0 ${large} 1 ${e1.x} ${e1.y} Z`;
  }
  const s2 = polar(cx, cy, inner, end);
  const e2 = polar(cx, cy, inner, start);
  return `M ${s1.x} ${s1.y} A ${r} ${r} 0 ${large} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${inner} ${inner} 0 ${large} 0 ${e2.x} ${e2.y} Z`;
}

function fillFor(index: number): string {
  return index === 0 ? T.fillA : index === 1 ? T.fillB : T.fillC;
}

function ChartCard({
  node,
  mode,
  meta,
  children,
  toolbar,
  legend,
  tooltip,
}: {
  node: PtNode;
  mode: PtRendererProps["mode"];
  meta: ChartMeta;
  children: ReactNode;
  toolbar?: ReactNode;
  legend?: ReactNode;
  tooltip?: ReactNode;
}): ReactElement {
  const title = propText(node, "title", meta.title);
  const description = propText(node, "description", meta.description);
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        data-pt-chart=""
        data-pt-chart-id={meta.id}
        data-pt-chart-kind={meta.kind}
        data-pt-chart-marks={meta.marks.join(" ")}
        style={{
          ...FILL,
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          background: T.bg,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "10px 12px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div data-pt-text="title" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{title}</div>
              <div data-pt-text="description" style={{ fontSize: 11, color: T.muted }}>{description}</div>
            </div>
            {toolbar}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: "relative", padding: "0 8px" }}>
          {children}
          {tooltip}
        </div>
        {legend}
        <div data-pt-text="footer" style={{ padding: "4px 12px 10px", fontSize: 11, color: T.muted }}>{propText(node, "footer", meta.footer)}</div>
      </div>
    </ControlRoot>
  );
}

function RangePills({
  mode,
  value,
  onChange,
  options,
}: {
  mode: PtRendererProps["mode"];
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
}): ReactElement {
  return (
    <div data-pt-chart-interactive="" style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          data-pt-chart-range={option}
          data-selected={option === value ? "true" : undefined}
          onClick={() => onChange(option)}
          disabled={mode === "edit"}
          style={{
            fontFamily: FONT,
            fontSize: 10,
            padding: "3px 6px",
            borderRadius: T.radius,
            border: `1px solid ${T.border}`,
            background: option === value ? T.fillA : T.bg,
            color: T.fg,
            cursor: mode === "edit" ? "default" : "pointer",
          }}
        >
          {option.replace("Last ", "")}
        </button>
      ))}
    </div>
  );
}

function Legend({
  items,
  icons,
}: {
  items: readonly { label: string; fill: string }[];
  icons?: boolean;
}): ReactElement {
  return (
    <div
      data-pt-chart-legend=""
      data-pt-chart-icons={icons ? "true" : undefined}
      style={{ display: "flex", gap: 12, justifyContent: "center", padding: "0 12px 4px", fontSize: 11 }}
    >
      {items.map((item) => (
        <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {icons ? (
            <span aria-hidden style={{ width: 10, height: 10, border: `1.5px solid ${T.fg}`, borderRadius: 2 }} />
          ) : (
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: item.fill, boxShadow: `inset 0 0 0 1px ${T.fg}` }} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function AxesSvg({
  w,
  h,
  pad,
  labels,
  yTicks,
}: {
  w: number;
  h: number;
  pad: { l: number; r: number; t: number; b: number };
  labels: readonly string[];
  yTicks?: boolean;
}): ReactElement {
  const innerW = w - pad.l - pad.r;
  return (
    <g data-pt-chart-axes="">
      <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} stroke={T.fg} strokeWidth="1.2" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={h - pad.b} stroke={T.fg} strokeWidth="1.2" />
      {labels.map((label, i) => {
        const x = pad.l + (innerW * (i + 0.5)) / labels.length;
        return (
          <text key={label} x={x} y={h - 6} textAnchor="middle" fontSize="9" fill={T.fg} fontFamily={FONT}>
            {label}
          </text>
        );
      })}
      {yTicks
        ? [0, 0.5, 1].map((t) => (
            <text
              key={t}
              x={pad.l - 6}
              y={h - pad.b - t * (h - pad.t - pad.b) + 3}
              textAnchor="end"
              fontSize="8"
              fill={T.fg}
              fontFamily={FONT}
            >
              {Math.round(t * 400)}
            </text>
          ))
        : null}
    </g>
  );
}

function CartesianPlot({
  meta,
  series,
  kind,
}: {
  meta: ChartMeta;
  series: Series;
  kind: "area" | "bar" | "line" | "tooltip";
}): ReactElement {
  const w = 360;
  const h = 168;
  const horizontal = has(meta, "horizontal");
  const pad = {
    l: has(meta, "axes") || (horizontal && !has(meta, "mixed")) ? 36 : 16,
    r: 12,
    t: 12,
    b: horizontal ? 14 : 22,
  };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = series.labels.length;
  const curve = curveOf(meta);
  const stacked = has(meta, "stacked") || kind === "tooltip";
  const expand = has(meta, "expand");
  const grouped = has(meta, "grouped");
  const negative = has(meta, "negative");
  const cols = series.values;
  const totals = series.labels.map((_, i) => cols.reduce((sum, row) => sum + Math.abs(row[i] ?? 0), 0));
  const rawMax = Math.max(1, ...cols.flatMap((row) => row.map((v) => Math.abs(v))), 1);
  const gid = meta.id.replaceAll(".", "-");

  const yAt = (value: number, max = rawMax) => pad.t + innerH - (value / max) * innerH;
  const xAt = (i: number) => pad.l + ((i + 0.5) * innerW) / n;

  const areaRows = cols.map((row, seriesIndex) =>
    series.labels.map((_, i) => {
      const v = row[i] ?? 0;
      if (!stacked) return { x: xAt(i), y: yAt(v) };
      const below = cols.slice(0, seriesIndex).reduce((sum, other) => sum + (other[i] ?? 0), 0);
      const total = totals[i] || 1;
      const top = expand ? (below + v) / total : below + v;
      const max = expand ? 1 : Math.max(1, ...totals);
      return { x: xAt(i), y: yAt(top, max) };
    }),
  );

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="img" aria-label={meta.title}>
      {has(meta, "gradient") || has(meta, "active") ? (
        <defs>
          {has(meta, "gradient") ? (
            <linearGradient id={`${gid}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.fg} stopOpacity="0.35" />
              <stop offset="100%" stopColor={T.fg} stopOpacity="0.02" />
            </linearGradient>
          ) : null}
          {has(meta, "active") ? (
            <pattern
              id={`${gid}-hatch`}
              patternUnits="userSpaceOnUse"
              width="6"
              height="6"
              patternTransform="rotate(35)"
            >
              <rect width="6" height="6" fill={T.fillA} />
              <path d="M 0 0 L 0 6" stroke={T.fg} strokeWidth="1.6" />
            </pattern>
          ) : null}
        </defs>
      ) : null}
      {horizontal ? (
        <g data-pt-chart-axes="">
          <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} stroke={T.fg} strokeWidth="1.2" />
          {has(meta, "mixed")
            ? null
            : series.labels.map((label, i) => {
                const y = pad.t + (innerH * (i + 0.5)) / n;
                return (
                  <text key={label} x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="8" fill={T.fg} fontFamily={FONT}>
                    {label}
                  </text>
                );
              })}
        </g>
      ) : (
        <AxesSvg w={w} h={h} pad={pad} labels={series.labels} yTicks={has(meta, "axes")} />
      )}
      {kind === "area"
        ? [...areaRows].reverse().map((points, reversedIndex) => {
            const seriesIndex = areaRows.length - 1 - reversedIndex;
            const fill = has(meta, "gradient") && seriesIndex === 0 ? `url(#${gid}-grad)` : fillFor(seriesIndex);
            return (
              <path
                key={`a-${seriesIndex}`}
                d={closeArea(points, h - pad.b, curve)}
                fill={fill}
                stroke={T.fg}
                strokeWidth="1.6"
              />
            );
          })
        : null}
      {kind === "line"
        ? cols.map((row, seriesIndex) => {
            const points = row.map((value, i) => ({ x: xAt(i), y: yAt(value) }));
            return (
              <g key={`l-${seriesIndex}`}>
                <path d={linePath(points, curve)} fill="none" stroke={T.fg} strokeWidth="1.8" opacity={1 - seriesIndex * 0.35} />
                {has(meta, "dots") || has(meta, "labels")
                  ? points.map((point, i) => {
                      const custom = has(meta, "dots-custom");
                      const colored = has(meta, "dots-colors");
                      if (custom) {
                        return (
                          <rect
                            key={i}
                            x={point.x - 3.5}
                            y={point.y - 3.5}
                            width="7"
                            height="7"
                            transform={`rotate(45 ${point.x} ${point.y})`}
                            fill={T.bg}
                            stroke={T.fg}
                            strokeWidth="1.4"
                          />
                        );
                      }
                      return (
                        <circle
                          key={i}
                          cx={point.x}
                          cy={point.y}
                          r={colored ? 3 + (i % 3) : 3}
                          fill={colored ? fillFor(i % 3) : T.bg}
                          stroke={T.fg}
                          strokeWidth="1.4"
                        />
                      );
                    })
                  : null}
                {has(meta, "labels")
                  ? points.map((point, i) => (
                      <text
                        key={`lb-${i}`}
                        x={point.x}
                        y={point.y - 8}
                        textAnchor="middle"
                        fontSize="8"
                        fill={T.fg}
                        fontFamily={FONT}
                      >
                        {has(meta, "labels-custom") ? `${row[i]}k` : row[i]}
                      </text>
                    ))
                  : null}
              </g>
            );
          })
        : null}
      {kind === "bar" || kind === "tooltip"
        ? series.labels.map((label, i) => {
            if (horizontal) {
              const max = Math.max(1, ...cols[0]!);
              const value = cols[0]![i] ?? 0;
              const bh = Math.max(10, (innerH / n) * 0.62);
              const y = pad.t + (innerH * i) / n + (innerH / n - bh) / 2;
              const bw = (Math.abs(value) / max) * innerW;
              return (
                <g key={label}>
                  <rect
                    x={pad.l}
                    y={y}
                    width={bw}
                    height={bh}
                    fill={has(meta, "active") && i === 1 ? `url(#${gid}-hatch)` : T.fillA}
                    stroke={T.fg}
                    strokeWidth={has(meta, "active") && i === 1 ? 2 : 1}
                    rx="2"
                  />
                  {has(meta, "mixed") ? (
                    <text x={pad.l + 4} y={y + bh / 2 + 3} fontSize="8" fill={T.fg} fontFamily={FONT}>
                      {label}
                    </text>
                  ) : null}
                </g>
              );
            }
            const slot = innerW / n;
            const group = grouped ? meta.series : 1;
            const barW = Math.max(6, (slot * 0.7) / group);
            if (negative) {
              const value = cols[0]![i] ?? 0;
              const zero = pad.t + innerH / 2;
              const bh = (Math.abs(value) / rawMax) * (innerH / 2);
              const y = value >= 0 ? zero - bh : zero;
              return (
                <rect
                  key={label}
                  x={xAt(i) - barW / 2}
                  y={y}
                  width={barW}
                  height={bh}
                  fill={value < 0 ? T.fillB : T.fillA}
                  stroke={T.fg}
                  strokeWidth="1"
                  rx="2"
                />
              );
            }
            if (stacked) {
              let acc = 0;
              const max = expand ? 1 : Math.max(1, ...totals);
              return (
                <g key={label} data-pt-active-bar={kind === "tooltip" && i === 1 ? "true" : undefined}>
                  {cols.map((row, seriesIndex) => {
                    const v = row[i] ?? 0;
                    const top = expand ? (acc + v) / (totals[i] || 1) : acc + v;
                    const y1 = yAt(expand ? acc / (totals[i] || 1) : acc, max);
                    const y2 = yAt(top, max);
                    acc += v;
                    return (
                      <rect
                        key={seriesIndex}
                        x={xAt(i) - barW / 2}
                        y={y2}
                        width={barW}
                        height={Math.max(1, y1 - y2)}
                        fill={fillFor(seriesIndex)}
                        stroke={T.fg}
                        strokeWidth="1"
                        rx="1.5"
                      />
                    );
                  })}
                </g>
              );
            }
            return (
              <g key={label}>
                {cols.map((row, seriesIndex) => {
                  const value = row[i] ?? 0;
                  const x = grouped ? xAt(i) - (barW * group) / 2 + seriesIndex * barW : xAt(i) - barW / 2;
                  const bh = (value / rawMax) * innerH;
                  const active = has(meta, "active") && i === 2 && seriesIndex === 0;
                  return (
                    <g key={seriesIndex}>
                      <rect
                        x={x}
                        y={yAt(value)}
                        width={barW}
                        height={bh}
                        fill={active ? `url(#${gid}-hatch)` : fillFor(seriesIndex)}
                        stroke={T.fg}
                        strokeWidth={active ? 2 : 1}
                        rx="2"
                      />
                      {has(meta, "labels") && seriesIndex === 0 ? (
                        <text x={x + barW / 2} y={yAt(value) - 4} textAnchor="middle" fontSize="8" fill={T.fg} fontFamily={FONT}>
                          {has(meta, "labels-custom") ? `${value}k` : value}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })
        : null}
      {kind === "tooltip" && has(meta, "indicator-line") ? (
        <line
          data-pt-chart-hover-line=""
          x1={xAt(1)}
          y1={pad.t}
          x2={xAt(1)}
          y2={h - pad.b}
          stroke={T.fg}
          strokeWidth="1.4"
        />
      ) : null}
    </svg>
  );
}

function PiePlot({
  meta,
  node,
  activeLabel,
}: {
  meta: ChartMeta;
  node: PtNode;
  activeLabel?: string;
}): ReactElement {
  const series = parseSeries(node, 1, PIE_LABELS, [PIE_VALUES]);
  const values = series.values[0]!;
  const total = Math.max(1, values.reduce((a, b) => a + b, 0));
  const cx = 170;
  const cy = 84;
  const donut = has(meta, "donut");
  const stacked = has(meta, "stacked");
  const r = 62;
  const inner = donut ? (stacked ? 42 : 34) : 0;
  const gap = has(meta, "separator-none") ? 0 : 0.04;
  let angle = -Math.PI / 2;
  const slices = values.map((value, i) => {
    const span = (value / total) * Math.PI * 2;
    const start = angle + gap / 2;
    const end = angle + span - gap / 2;
    angle += span;
    return { start, end, value, label: series.labels[i]!, i };
  });
  const focus = activeLabel ? slices.find((slice) => slice.label === activeLabel) : undefined;
  return (
    <svg viewBox="0 0 340 168" width="100%" height="100%" role="img" aria-label={meta.title}>
      {slices.map((slice) => {
        const active = (has(meta, "active") && slice.i === 1) || focus?.i === slice.i;
        const mid = (slice.start + slice.end) / 2;
        const explode = active ? 6 : 0;
        const dx = Math.sin(mid) * explode;
        const dy = -Math.cos(mid) * explode;
        const ox = cx + dx;
        const oy = cy + dy;
        const outer = polar(ox, oy, r + 16, mid);
        const rim = polar(ox, oy, r + 2, mid);
        const listed = polar(ox, oy, donut ? (r + inner) / 2 : r * 0.52, mid);
        return (
          <g key={slice.label}>
            <path
              d={arcPath(ox, oy, r, inner, slice.start, slice.end)}
              fill={fillFor(slice.i % 3)}
              stroke={T.fg}
              strokeWidth={active ? 2 : 1.2}
            />
            {has(meta, "label-list") ? (
              <text
                data-pt-chart-label-list=""
                x={listed.x}
                y={listed.y}
                textAnchor="middle"
                fontSize="8"
                fill={T.fg}
                fontFamily={FONT}
              >
                {slice.label}
              </text>
            ) : has(meta, "labels") ? (
              <g data-pt-chart-label-outside="">
                <line x1={rim.x} y1={rim.y} x2={outer.x} y2={outer.y} stroke={T.fg} strokeWidth="1" />
                <text x={outer.x} y={outer.y} textAnchor="middle" fontSize="8" fill={T.fg} fontFamily={FONT}>
                  {has(meta, "labels-custom") ? `${slice.value}` : slice.label}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      {stacked
        ? (() => {
            const innerVals = MOBILE.slice(0, values.length);
            const innerTotal = innerVals.reduce((a, b) => a + b, 0) || 1;
            let a = -Math.PI / 2;
            return innerVals.map((value, i) => {
              const span = (value / innerTotal) * Math.PI * 2;
              const start = a;
              const end = a + span;
              a += span;
              return (
                <path
                  key={`in-${i}`}
                  d={arcPath(cx, cy, 36, 22, start, end)}
                  fill={fillFor((i + 1) % 3)}
                  stroke={T.fg}
                  strokeWidth="1"
                />
              );
            });
          })()
        : null}
      {has(meta, "center-text") ? (
        <g data-pt-chart-center="">
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="14" fontWeight="600" fill={T.fg} fontFamily={FONT}>
            {(focus?.value ?? total).toLocaleString()}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill={T.fg} fontFamily={FONT}>
            {focus?.label ?? "Visitors"}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function RadarPlot({ meta, node }: { meta: ChartMeta; node: PtNode }): ReactElement {
  const series = parseSeries(node, meta.series, RADAR_LABELS, [DESKTOP, MOBILE]);
  const cx = 170;
  const cy = 84;
  const r = 58;
  const n = series.labels.length;
  const levels = has(meta, "grid-none") ? [] : has(meta, "grid-custom") ? [0.5, 1] : [0.33, 0.66, 1];
  const circle = has(meta, "grid-circle");
  const max = Math.max(1, ...series.values.flat());
  const ring = (level: number) =>
    series.labels.map((_, i) => polar(cx, cy, r * level, (i * 2 * Math.PI) / n));
  return (
    <svg viewBox="0 0 340 168" width="100%" height="100%" role="img" aria-label={meta.title}>
      {circle
        ? levels.map((level) => (
            <circle
              key={level}
              cx={cx}
              cy={cy}
              r={r * level}
              fill={has(meta, "grid-fill") && level === 1 ? T.fillC : "none"}
              stroke={T.fg}
              strokeWidth="1"
              opacity="0.55"
            />
          ))
        : levels.map((level) => (
            <polygon
              key={level}
              points={ring(level).map((p) => `${p.x},${p.y}`).join(" ")}
              fill={has(meta, "grid-fill") && level === 1 ? T.fillC : "none"}
              stroke={T.fg}
              strokeWidth="1"
              opacity="0.55"
            />
          ))}
      {has(meta, "no-radial") || has(meta, "grid-none")
        ? null
        : series.labels.map((_, i) => {
            const p = polar(cx, cy, r, (i * 2 * Math.PI) / n);
            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={T.fg} strokeWidth="1" opacity="0.45" />;
          })}
      {series.values.map((row, seriesIndex) => {
        const pts = row.map((value, i) => polar(cx, cy, (value / max) * r, (i * 2 * Math.PI) / n));
        return (
          <g key={seriesIndex}>
            <polygon
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={has(meta, "lines-only") ? "none" : fillFor(seriesIndex)}
              stroke={T.fg}
              strokeWidth="1.6"
            />
            {has(meta, "dots")
              ? pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={T.bg} stroke={T.fg} strokeWidth="1.3" />)
              : null}
          </g>
        );
      })}
      {series.labels.map((label, i) => {
        const p = polar(cx, cy, r + 14, (i * 2 * Math.PI) / n);
        return (
          <text key={label} x={p.x} y={p.y} textAnchor="middle" fontSize="8" fill={T.fg} fontFamily={FONT}>
            {has(meta, "labels-custom") ? label.slice(0, 3) : label}
          </text>
        );
      })}
      {has(meta, "radius-ticks")
        ? [50, 100, 150].map((tick, i) => (
            <text key={tick} x={cx + 4} y={cy - r * ((i + 1) / 3)} fontSize="7" fill={T.fg} fontFamily={FONT}>
              {tick}
            </text>
          ))
        : null}
    </svg>
  );
}

function RadialPlot({ meta, node }: { meta: ChartMeta; node: PtNode }): ReactElement {
  const series = parseSeries(node, meta.series, PIE_LABELS.slice(0, 3), [[275, 200, 187], [80, 120, 90]]);
  const cx = 170;
  const cy = 86;
  const shape = has(meta, "shape");
  const sweep = shape ? Math.PI * 1.35 : Math.PI * 2;
  const start0 = -Math.PI / 2;
  const stacked = has(meta, "stacked");
  const rows = stacked ? series.values : [series.values[0]!];
  const n = stacked ? 1 : series.labels.length;
  return (
    <svg viewBox="0 0 340 168" width="100%" height="100%" role="img" aria-label={meta.title}>
      {has(meta, "grid")
        ? [0.35, 0.62, 0.9].map((level) => (
            <circle key={level} cx={cx} cy={cy} r={58 * level} fill="none" stroke={T.fg} strokeWidth="1" opacity="0.35" />
          ))
        : null}
      {stacked
        ? (() => {
            const desktop = series.values[0]![0] ?? 0;
            const mobile = series.values[1]?.[0] ?? 80;
            const sum = desktop + mobile;
            const a1 = start0 + (desktop / Math.max(1, sum)) * sweep;
            return (
              <g>
                <path d={arcPath(cx, cy, 62, 40, start0, start0 + sweep)} fill={T.fillC} stroke={T.fg} strokeWidth="1" />
                <path d={arcPath(cx, cy, 62, 40, start0, a1)} fill={T.fillA} stroke={T.fg} strokeWidth="1.2" />
                <path d={arcPath(cx, cy, 62, 40, a1, start0 + sweep * (sum / (sum + 40)))} fill={T.fillB} stroke={T.fg} strokeWidth="1.2" />
              </g>
            );
          })()
        : rows[0]!.slice(0, n).map((value, i) => {
            const rr = 62 - i * 12;
            const inner = rr - 10;
            const end = start0 + (value / 400) * sweep;
            return (
              <g key={i}>
                <path d={arcPath(cx, cy, rr, inner, start0, start0 + sweep)} fill={T.fillC} stroke={T.fg} strokeWidth="1" />
                <path d={arcPath(cx, cy, rr, inner, start0, end)} fill={fillFor(i)} stroke={T.fg} strokeWidth="1.2" />
                {has(meta, "labels") ? (
                  <text x={cx} y={18 + i * 12} textAnchor="middle" fontSize="8" fill={T.fg} fontFamily={FONT}>
                    {series.labels[i]} {value}
                  </text>
                ) : null}
              </g>
            );
          })}
      {has(meta, "center-text") ? (
        <g data-pt-chart-center="">
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="14" fontWeight="600" fill={T.fg} fontFamily={FONT}>
            {series.values[0]![0]}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill={T.fg} fontFamily={FONT}>
            Visitors
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function TooltipCard({ meta, series }: { meta: ChartMeta; series: Series }): ReactElement {
  const indicator = has(meta, "indicator-none") ? "none" : has(meta, "indicator-line") ? "line" : "dot";
  const hideLabel = has(meta, "label-none");
  const label = has(meta, "label-custom")
    ? "Activity"
    : has(meta, "label-formatter")
      ? "Feb 2024"
      : series.labels[1] ?? "Feb";
  const rows: { label: string; value: number; fill: string }[] = [
    { label: "Desktop", value: series.values[0]![1] ?? 305, fill: T.fillA },
    { label: "Mobile", value: series.values[1]?.[1] ?? 200, fill: T.fillB },
  ];
  if (has(meta, "advanced")) rows.push({ label: "Other", value: OTHER[1]!, fill: T.fillC });
  return (
    <div
      data-pt-chart-tooltip=""
      data-pt-chart-indicator={indicator}
      style={{
        position: "absolute",
        top: 8,
        left: "42%",
        minWidth: 120,
        padding: "8px 10px",
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        background: T.bg,
        fontSize: 11,
        boxShadow: "0 8px 20px -12px rgb(0 0 0 / 0.35)",
      }}
    >
      {hideLabel ? null : <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>}
      {rows.map((row) => (
        <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          {indicator === "none" ? null : indicator === "line" ? (
            <span aria-hidden style={{ width: 8, height: 2, background: T.fg }} />
          ) : has(meta, "icons") ? (
            <span aria-hidden style={{ width: 10, height: 10, border: `1.5px solid ${T.fg}`, borderRadius: 2 }} />
          ) : (
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: row.fill, boxShadow: `inset 0 0 0 1px ${T.fg}` }} />
          )}
          <span style={{ flex: 1 }}>{row.label}</span>
          <span style={{ fontWeight: 600 }}>{has(meta, "formatter") ? `${row.value} visitors` : row.value}</span>
        </div>
      ))}
      {has(meta, "advanced") ? (
        <div style={{ marginTop: 6, color: T.muted }}>Total {rows.reduce((sum, row) => sum + row.value, 0)}</div>
      ) : null}
    </div>
  );
}

function extraSeries(meta: ChartMeta): { labels?: readonly string[]; values?: number[][] } | undefined {
  if (has(meta, "mixed")) return { labels: MIXED_LABELS, values: [MIXED_VALUES] };
  if (has(meta, "negative")) return { labels: NEG_LABELS, values: [NEG_VALUES] };
  return undefined;
}

function legendItems(meta: ChartMeta): { label: string; fill: string }[] | null {
  if (!has(meta, "legend") && !has(meta, "icons")) return null;
  if (meta.kind === "pie") {
    return PIE_LABELS.map((label, i) => ({ label, fill: fillFor(i % 3) }));
  }
  const items: { label: string; fill: string }[] = [{ label: "Desktop", fill: T.fillA }];
  if (meta.series > 1) items.push({ label: "Mobile", fill: T.fillB });
  return items;
}

export function ChartRenderer({ node, mode, meta }: PtRendererProps & { meta: ChartMeta }): ReactElement {
  const pieInteractive = has(meta, "interactive") && meta.kind === "pie";
  const interactive = has(meta, "interactive") && meta.kind !== "pie";
  const pieLabels = node.options?.map((option) => option.label) ?? [...PIE_LABELS];
  const rangeOptions = pieInteractive ? pieLabels : [...CARTESIAN_RANGES];
  const [range, setRange] = useState(rangeOptions[0]!);
  const extra = extraSeries(meta);
  const series = interactive ? sliceSeries(cartesian(node, meta, extra), range) : cartesian(node, meta, extra);
  const legend = legendItems(meta);
  const toolbar =
    interactive || pieInteractive ? (
      <RangePills mode={mode} value={range} onChange={setRange} options={rangeOptions} />
    ) : undefined;

  const plot =
    meta.kind === "pie" ? (
      <PiePlot meta={meta} node={node} activeLabel={pieInteractive ? range : undefined} />
    ) : meta.kind === "radar" ? (
      <RadarPlot meta={meta} node={node} />
    ) : meta.kind === "radial" ? (
      <RadialPlot meta={meta} node={node} />
    ) : (
      <CartesianPlot
        meta={meta}
        series={series}
        kind={meta.kind === "tooltip" ? "tooltip" : meta.kind === "bar" ? "bar" : meta.kind === "line" ? "line" : "area"}
      />
    );

  return (
    <ChartCard
      node={node}
      mode={mode}
      meta={meta}
      toolbar={toolbar}
      legend={legend ? <Legend items={legend} icons={has(meta, "icons")} /> : null}
      tooltip={meta.kind === "tooltip" ? <TooltipCard meta={meta} series={series} /> : null}
    >
      {plot}
    </ChartCard>
  );
}
