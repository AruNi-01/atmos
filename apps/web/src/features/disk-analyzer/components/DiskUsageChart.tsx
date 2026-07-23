"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { Switch, cn } from "@workspace/ui";
import type { DiskNode } from "@/api/ws/disk-analyzer-api";
import {
  SUNBURST_CHART_DEPTH,
  TREEMAP_CHART_DEPTH,
  formatBytes,
  toEChartsTree,
  type ChartMode,
  type EChartsTreeDatum,
} from "@/features/disk-analyzer/lib/tree-adapters";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/** Stable series id so treemap ↔ sunburst can animate with universalTransition. */
const SERIES_ID = "disk-usage";

type Props = {
  node: DiskNode;
  rootSize: number;
  mode: ChartMode;
  projectLabel: string;
  otherLabel?: string;
  showParentLabelText?: string;
  onSelectPath: (path: string) => void;
  onDrillPath: (path: string) => void;
};

export function DiskUsageChart({
  node,
  rootSize,
  mode,
  projectLabel,
  otherLabel = "Other",
  showParentLabelText = "Parent labels",
  onSelectPath,
  onDrillPath,
}: Props) {
  const [showParentLabels, setShowParentLabels] = useState(false);
  const chartRootSize = rootSize > 0 ? rootSize : node.size || 1;

  /**
   * Shared tree for both series (needed for universalTransition).
   * Built to sunburst depth; treemap uses leafDepth to show only the first ring.
   */
  const seriesData = useMemo((): EChartsTreeDatum[] => {
    const children = node.children ?? [];
    if (children.length === 0) {
      return [
        toEChartsTree(node, chartRootSize, {
          maxDepth: 1,
          otherLabel,
        }),
      ];
    }
    // Prefer non-zero tiles first so mid-scan zeros don't dominate the canvas.
    const ordered = [...children].sort((a, b) => {
      if (a.size !== b.size) return b.size - a.size;
      return a.name.localeCompare(b.name);
    });
    return ordered.map((child) =>
      toEChartsTree(child, chartRootSize, {
        maxDepth: SUNBURST_CHART_DEPTH,
        otherLabel,
      }),
    );
  }, [node, chartRootSize, otherLabel]);

  const option = useMemo<EChartsOption>(() => {
    const tooltipFormatter = (params: unknown) => {
      const p = params as {
        name?: string;
        value?: number | number[];
        treePathInfo?: Array<{ name?: string }>;
        data?: {
          path?: string;
          isProject?: boolean;
          bytes?: number;
          value?: number;
        };
      };
      const rawValue = Array.isArray(p.value) ? p.value[0] : p.value;
      const size =
        typeof p.data?.bytes === "number"
          ? p.data.bytes
          : typeof p.data?.value === "number"
            ? p.data.value
            : typeof rawValue === "number"
              ? rawValue
              : 0;
      const denom = chartRootSize > 0 ? chartRootSize : 1;
      const share = Math.min(100, (size / denom) * 100).toFixed(1);
      const name = escapeHtml(p.name ?? "");
      const path = escapeHtml(p.data?.path ?? "");
      const projectSuffix = p.data?.isProject ? ` · ${escapeHtml(projectLabel)}` : "";
      return [
        `<div style="font-weight:600;margin-bottom:2px">${name}${projectSuffix}</div>`,
        path
          ? `<div style="opacity:0.75;font-size:11px;margin-bottom:4px">${path}</div>`
          : "",
        `<div>${escapeHtml(formatBytes(size))} · ${share}%</div>`,
      ].join("");
    };

    const tooltip = {
      formatter: tooltipFormatter,
      borderWidth: 0,
      backgroundColor: "rgba(24,24,27,0.94)",
      textStyle: { color: "rgba(250,250,250,0.95)", fontSize: 12 },
      padding: [8, 12] as [number, number],
      extraCssText:
        "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);",
    };

    const labelFormatter = (params: {
      name?: string;
      value?: number | number[];
      data?: { bytes?: number };
    }) => {
      const raw = Array.isArray(params.value) ? params.value[0] : params.value;
      const size =
        typeof params.data?.bytes === "number"
          ? params.data.bytes
          : typeof raw === "number"
            ? raw
            : 0;
      const name = params.name ?? "";
      if (!size) return name;
      return `${name}\n${formatBytes(size)}`;
    };

    if (mode === "treemap") {
      return {
        backgroundColor: "transparent",
        tooltip,
        series: [
          {
            type: "treemap",
            id: SERIES_ID,
            name: "Disk usage",
            animationDurationUpdate: 1000,
            universalTransition: true,
            roam: false,
            // External drill via breadcrumb/click — no echarts internal zoom chrome.
            nodeClick: false,
            breadcrumb: { show: false },
            // Only paint the focused folder's children as flat tiles (depth 1).
            // Nested data is still present so switching to sunburst can animate.
            leafDepth: TREEMAP_CHART_DEPTH,
            visibleMin: 0,
            // Keep sibling blocks visible on hover.
            emphasis: {
              itemStyle: {
                borderColor: "rgba(255,255,255,0.55)",
                borderWidth: 2,
                shadowBlur: 0,
                shadowColor: "transparent",
              },
              label: { show: true, color: "#ffffff" },
            },
            blur: {
              itemStyle: { opacity: 0.65 },
              label: { opacity: 0.75, color: "rgba(255,255,255,0.85)" },
            },
            label: {
              show: true,
              formatter: labelFormatter,
              fontSize: 12,
              lineHeight: 15,
              color: "#ffffff",
              textShadowColor: "rgba(0,0,0,0.55)",
              textShadowBlur: 3,
            },
            upperLabel: {
              show: showParentLabels,
              height: 22,
              color: "rgba(255,255,255,0.9)",
              fontSize: 11,
            },
            itemStyle: {
              borderColor: "rgba(0,0,0,0.35)",
              borderWidth: 2,
              gapWidth: 4,
              borderRadius: 6,
            },
            levels: getTreemapLevels(showParentLabels),
            data: seriesData,
          },
        ],
      };
    }

    return {
      backgroundColor: "transparent",
      tooltip,
      series: [
        {
          type: "sunburst",
          id: SERIES_ID,
          name: "Disk usage",
          radius: ["16%", "90%"],
          sort: undefined,
          animationDurationUpdate: 1000,
          universalTransition: true,
          nodeClick: false,
          levels: [{}, {}, {}],
          emphasis: {
            focus: "ancestor",
            itemStyle: {
              borderColor: "rgba(255,255,255,0.55)",
              borderWidth: 2,
            },
            label: { color: "#ffffff" },
          },
          blur: {
            itemStyle: { opacity: 0.55 },
            label: { opacity: 0.65, color: "rgba(255,255,255,0.8)" },
          },
          label: {
            rotate: "radial",
            minAngle: 8,
            fontSize: 10,
            lineHeight: 13,
            color: "#ffffff",
            formatter: labelFormatter,
          },
          itemStyle: {
            borderRadius: 4,
            borderWidth: 1.5,
            borderColor: "rgba(0,0,0,0.35)",
          },
          data: seriesData,
        },
      ],
    };
  }, [chartRootSize, mode, projectLabel, seriesData, showParentLabels]);

  return (
    <div className="relative h-full min-h-[360px] w-full">
      {mode === "treemap" ? (
        <label
          className={cn(
            "absolute right-2 top-2 z-10 flex cursor-pointer items-center gap-2 rounded-lg",
            "border border-border/60 bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground",
            "shadow-sm backdrop-blur-sm",
          )}
        >
          <Switch
            checked={showParentLabels}
            onCheckedChange={(checked) => setShowParentLabels(checked === true)}
            className="scale-90"
          />
          <span className="select-none whitespace-nowrap">{showParentLabelText}</span>
        </label>
      ) : null}
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%", minHeight: 360 }}
        opts={{ renderer: "canvas" }}
        // Keep series for universalTransition; only replace when structure changes.
        notMerge={false}
        lazyUpdate
        onEvents={{
          click: (params: {
            data?: { path?: string; isDir?: boolean; name?: string };
          }) => {
            const path = params?.data?.path;
            if (!path) return;
            const name = params.data?.name;
            if (name === "__other__" || name === otherLabel) {
              onSelectPath(path);
              return;
            }
            onSelectPath(path);
            if (params.data?.isDir) {
              onDrillPath(path);
            }
          },
        }}
      />
    </div>
  );
}

/** Levels adapted from ECharts treemap-show-parent / drill-down examples. */
function getTreemapLevels(showParent: boolean) {
  return [
    {
      itemStyle: {
        borderColor: "transparent",
        borderWidth: 0,
        gapWidth: 4,
      },
      upperLabel: { show: false },
    },
    {
      // Top tiles — per-node colors already set from size; keep borders clean.
      itemStyle: {
        borderColor: "rgba(0,0,0,0.45)",
        borderWidth: 2,
        gapWidth: 3,
        borderRadius: 6,
      },
      upperLabel: {
        show: showParent,
        height: 22,
      },
      emphasis: {
        itemStyle: {
          borderColor: "rgba(255,255,255,0.5)",
        },
      },
    },
    {
      // Nested ring (sunburst transition / deeper data): slightly vary saturation.
      colorSaturation: [0.4, 0.7],
      itemStyle: {
        borderWidth: 1.5,
        gapWidth: 2,
        borderColorSaturation: 0.5,
        borderRadius: 4,
      },
    },
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
