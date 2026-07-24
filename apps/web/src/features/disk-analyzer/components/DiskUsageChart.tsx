"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { FolderInput, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
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

/** Crossfade duration when switching treemap ↔ sunburst (dual instances, no residual). */
const MODE_CROSSFADE_MS = 320;

/**
 * Shared hover chrome for treemap + sunburst (official focus/blur pattern).
 * Does not override fill color — per-tile #rrggbb stays from data.itemStyle.
 */
const CHART_EMPHASIS = {
  itemStyle: {
    borderColor: "rgba(255,255,255,0.55)",
    borderWidth: 1.5,
    shadowBlur: 8,
    shadowColor: "rgba(0,0,0,0.35)",
  },
  label: {
    show: true,
    color: "#ffffff",
  },
} as const;

const CHART_BLUR = {
  itemStyle: {
    opacity: 0.35,
  },
  label: {
    opacity: 0.45,
  },
} as const;

type ChartNodeData = {
  path?: string;
  name?: string;
  isDir?: boolean;
  isProject?: boolean;
  isWorkspace?: boolean;
  isAtmosRuntime?: boolean;
  bytes?: number;
  value?: number;
};

/** Same pattern as CenterStageFileTabContextMenu — DropdownMenu at cursor. */
type ContextMenuState = {
  x: number;
  y: number;
  path: string;
  name: string;
  isDir: boolean;
  canDelete: boolean;
};

type Props = {
  node: DiskNode;
  rootSize: number;
  mode: ChartMode;
  /** Scan root path — delete is blocked for this path (same as Details). */
  scanPath: string;
  projectLabel: string;
  workspaceLabel: string;
  runtimeLabel: string;
  otherLabel?: string;
  enterDirectoryLabel: string;
  deleteLabel: string;
  onSelectPath: (path: string) => void;
  onDrillPath: (path: string) => void;
  /** Opens the same delete confirm dialog as Details. */
  onRequestDelete: (path: string) => void;
};

export function DiskUsageChart({
  node,
  rootSize,
  mode,
  scanPath,
  projectLabel,
  workspaceLabel,
  runtimeLabel,
  otherLabel = "Other",
  enterDirectoryLabel,
  deleteLabel,
  onSelectPath,
  onDrillPath,
  onRequestDelete,
}: Props) {
  const chartRootSize = rootSize > 0 ? rootSize : node.size || 1;
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const treemapRef = useRef<{ resize: () => void } | null>(null);
  const sunburstRef = useRef<{ resize: () => void } | null>(null);

  // Side-panel open/close only changes flex width — both chart instances must resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        treemapRef.current?.resize();
        sunburstRef.current?.resize();
      });
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  /** Ordered immediate children — shared by both chart data builds. */
  const orderedChildren = useMemo(() => {
    const children = node.children ?? [];
    if (children.length === 0) return [];
    // Prefer non-zero tiles first so mid-scan zeros don't dominate the canvas.
    return [...children].sort((a, b) => {
      if (a.size !== b.size) return b.size - a.size;
      return a.name.localeCompare(b.name);
    });
  }, [node]);

  /**
   * Treemap: flat tiles sized by real bytes (mild ease).
   * Must NOT use hierarchical sum(children) — that can reverse 46GB vs 38GB.
   */
  const treemapData = useMemo((): EChartsTreeDatum[] => {
    if (orderedChildren.length === 0) {
      return [
        toEChartsTree(node, chartRootSize, {
          maxDepth: 1,
          otherLabel,
          valueMode: "bytes-eased",
        }),
      ];
    }
    return orderedChildren.map((child, i) =>
      toEChartsTree(child, chartRootSize, {
        maxDepth: 1,
        otherLabel,
        valueMode: "bytes-eased",
      }, 0, i),
    );
  }, [node, chartRootSize, orderedChildren, otherLabel]);

  /**
   * Sunburst: up to 3 rings; parent value = sum(children) for wedge containment.
   */
  const sunburstData = useMemo((): EChartsTreeDatum[] => {
    if (orderedChildren.length === 0) {
      return [
        toEChartsTree(node, chartRootSize, {
          maxDepth: 1,
          otherLabel,
          valueMode: "hierarchical",
        }),
      ];
    }
    return orderedChildren.map((child, i) =>
      toEChartsTree(child, chartRootSize, {
        maxDepth: SUNBURST_CHART_DEPTH,
        otherLabel,
        valueMode: "hierarchical",
      }, 0, i),
    );
  }, [node, chartRootSize, orderedChildren, otherLabel]);

  const chartChrome = useMemo(() => {
    const tooltipFormatter = (params: unknown) => {
      const p = params as {
        name?: string;
        seriesName?: string;
        value?: number | number[];
        data?: ChartNodeData;
      };
      // Skip the synthetic series root (no path → was showing as "Disk usage").
      if (!p.data?.path) return "";
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
      const fullPath = p.data.path ?? "";
      const path = escapeHtml(middleEllipsisPath(fullPath));
      const kindChip = kindChipHtml(p.data, {
        projectLabel,
        workspaceLabel,
        runtimeLabel,
      });
      const sizeText = escapeHtml(`${formatBytes(size)} · ${share}%`);
      // Row 1: name + kind chip ………… size · share% (size flush right)
      // Row 2: path (middle-ellipsis)
      return [
        `<div style="display:flex;align-items:center;gap:10px;min-width:180px;max-width:320px">`,
        `<div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">`,
        `<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>`,
        kindChip,
        `</div>`,
        `<span style="flex-shrink:0;font-variant-numeric:tabular-nums;opacity:0.9">${sizeText}</span>`,
        `</div>`,
        path
          ? `<div style="opacity:0.75;font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px" title="${escapeHtml(fullPath)}">${path}</div>`
          : "",
      ].join("");
    };

    const tooltip = {
      // Item only — never fall back to series name ("Disk usage").
      trigger: "item" as const,
      formatter: tooltipFormatter,
      borderWidth: 0,
      backgroundColor: "rgba(24,24,27,0.94)",
      textStyle: { color: "rgba(250,250,250,0.95)", fontSize: 12 },
      padding: [8, 12] as [number, number],
      // Instant show/hide — animated tooltips fight sunburst hit-testing.
      showDelay: 0,
      hideDelay: 0,
      transitionDuration: 0,
      enterable: false,
      // Offset so the DOM never sits under the cursor (avoids enter/leave flicker).
      position: (point: number[]) => [point[0] + 14, point[1] + 14] as [number, number],
      extraCssText:
        "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);pointer-events:none;",
    };

    const labelFormatter = (params: {
      name?: string;
      value?: unknown;
      data?: { bytes?: number } | unknown;
    }) => {
      const raw = Array.isArray(params.value) ? params.value[0] : params.value;
      const data =
        params.data && typeof params.data === "object"
          ? (params.data as { bytes?: number })
          : undefined;
      const size =
        typeof data?.bytes === "number"
          ? data.bytes
          : typeof raw === "number"
            ? raw
            : 0;
      const name = params.name ?? "";
      if (!size) return name;
      return `${name}\n${formatBytes(size)}`;
    };

    return { tooltip, labelFormatter };
  }, [chartRootSize, projectLabel, runtimeLabel, workspaceLabel]);

  /**
   * Two separate chart instances — switching only toggles visibility.
   * Never mutate series type on one instance (that left residual treemap tiles under sunburst).
   */
  const treemapOption = useMemo(
    () =>
      ({
        backgroundColor: "transparent",
        tooltip: chartChrome.tooltip,
        hoverLayerThreshold: Number.POSITIVE_INFINITY,
        series: [
          {
            type: "treemap" as const,
            id: "disk-usage-treemap",
            name: "",
            // ECharts defaults are width/height ~80% centered — fill the canvas.
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            animation: true,
            animationDurationUpdate: 400,
            stateAnimation: { duration: 200 },
            roam: false,
            nodeClick: false as const,
            breadcrumb: { show: false },
            leafDepth: TREEMAP_CHART_DEPTH,
            visibleMin: 0,
            cursor: "pointer",
            emphasis: {
              focus: "self",
              ...CHART_EMPHASIS,
            },
            blur: CHART_BLUR,
            label: {
              show: true,
              silent: true,
              formatter: chartChrome.labelFormatter,
              fontSize: 12,
              lineHeight: 15,
              color: "#ffffff",
              textShadowColor: "rgba(0,0,0,0.55)",
              textShadowBlur: 3,
            },
            upperLabel: { show: false },
            itemStyle: {
              borderColor: "rgba(0,0,0,0.35)",
              borderWidth: 1.5,
              gapWidth: 2,
              borderRadius: 4,
            },
            levels: TREEMAP_LEVELS,
            data: treemapData,
          },
        ],
      }) satisfies EChartsOption,
    [chartChrome, treemapData],
  );

  const sunburstOption = useMemo(
    () =>
      ({
        backgroundColor: "transparent",
        tooltip: chartChrome.tooltip,
        hoverLayerThreshold: Number.POSITIVE_INFINITY,
        series: [
          {
            type: "sunburst" as const,
            id: "disk-usage-sunburst",
            name: "",
            center: ["50%", "50%"],
            radius: ["12%", "100%"],
            sort: false as const,
            animation: true,
            animationDurationUpdate: 400,
            stateAnimation: { duration: 200 },
            nodeClick: false as const,
            cursor: "pointer",
            levels: [
              {},
              {
                label: { silent: true },
                itemStyle: {
                  borderWidth: 1.5,
                  borderColor: "rgba(0,0,0,0.35)",
                },
              },
              {
                label: { silent: true },
                itemStyle: {
                  borderWidth: 1.5,
                  borderColor: "rgba(0,0,0,0.35)",
                },
              },
              {
                label: { silent: true },
                itemStyle: {
                  borderWidth: 1.5,
                  borderColor: "rgba(0,0,0,0.35)",
                },
              },
            ],
            emphasis: {
              focus: "ancestor",
              ...CHART_EMPHASIS,
            },
            blur: CHART_BLUR,
            label: {
              silent: true,
              rotate: "radial",
              minAngle: 8,
              fontSize: 10,
              lineHeight: 13,
              color: "#ffffff",
              formatter: chartChrome.labelFormatter,
            },
            itemStyle: {
              borderRadius: 2,
              borderWidth: 1.5,
              borderColor: "rgba(0,0,0,0.35)",
            },
            data: sunburstData,
          },
        ],
      }) satisfies EChartsOption,
    [chartChrome, sunburstData],
  );

  const openContextMenu = (params: {
    data?: ChartNodeData;
    event?: { event?: MouseEvent };
  }) => {
    const native = params.event?.event;
    native?.preventDefault?.();
    native?.stopPropagation?.();
    const data = params.data;
    const path = data?.path;
    if (!path) return;
    const name = data?.name ?? "";
    if (name === "__other__" || name === otherLabel) {
      onSelectPath(path);
      return;
    }
    onSelectPath(path);
    const canDelete =
      path !== scanPath &&
      name !== "__other__" &&
      name !== otherLabel &&
      !path.startsWith("atmos://");
    setMenu({
      // Viewport coords — DropdownMenu trigger is `fixed` (see file-tab menu).
      x: native?.clientX ?? 0,
      y: native?.clientY ?? 0,
      path,
      name,
      isDir: data?.isDir === true,
      canDelete,
    });
  };

  const onChartClick = (params: { data?: ChartNodeData }) => {
    setMenu(null);
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
  };

  const chartEvents = {
    click: onChartClick,
    contextmenu: openContextMenu,
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full [&_canvas]:cursor-pointer"
    >
      {/*
        Dual instances: switching only crossfades visibility.
        Mutating series.type on one ECharts instance left residual graphics (overlap).
      */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity ease-out",
          mode === "treemap"
            ? "z-10 opacity-100"
            : "pointer-events-none z-0 opacity-0",
        )}
        style={{ transitionDuration: `${MODE_CROSSFADE_MS}ms` }}
        aria-hidden={mode !== "treemap"}
      >
        <ReactECharts
          option={treemapOption}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge={false}
          lazyUpdate={false}
          onChartReady={(instance: { resize: () => void }) => {
            treemapRef.current = instance;
            instance.resize();
          }}
          onEvents={chartEvents}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 transition-opacity ease-out",
          mode === "sunburst"
            ? "z-10 opacity-100"
            : "pointer-events-none z-0 opacity-0",
        )}
        style={{ transitionDuration: `${MODE_CROSSFADE_MS}ms` }}
        aria-hidden={mode !== "sunburst"}
      >
        <ReactECharts
          option={sunburstOption}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge={false}
          lazyUpdate={false}
          onChartReady={(instance: { resize: () => void }) => {
            sunburstRef.current = instance;
            instance.resize();
          }}
          onEvents={chartEvents}
        />
      </div>
      <DropdownMenu
        open={!!menu}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-hidden
            className="pointer-events-none fixed size-0"
            style={{
              left: menu?.x ?? -9999,
              top: menu?.y ?? -9999,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-44">
          {menu?.isDir ? (
            <DropdownMenuItem
              onClick={() => {
                if (!menu) return;
                onSelectPath(menu.path);
                onDrillPath(menu.path);
                setMenu(null);
              }}
            >
              <FolderInput className="size-4" />
              {enterDirectoryLabel}
            </DropdownMenuItem>
          ) : null}
          {menu?.canDelete ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (!menu) return;
                onSelectPath(menu.path);
                onRequestDelete(menu.path);
                setMenu(null);
              }}
            >
              <Trash2 className="size-4" />
              {deleteLabel}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Level 0 is the synthetic ECharts root wrapping siblings — keep it invisible and
 * non-interactive so it never paints or tooltips as "Disk usage".
 * Level 1+ are real directory tiles.
 */
const TREEMAP_LEVELS = [
  {
    // Synthetic parent: no chrome, no label, no hover target.
    itemStyle: {
      borderColor: "transparent",
      borderWidth: 0,
      gapWidth: 0,
      color: "transparent",
    },
    label: { show: false },
    upperLabel: { show: false },
    emphasis: {
      disabled: true,
      itemStyle: {
        borderWidth: 0,
        color: "transparent",
      },
      label: { show: false },
    },
    blur: {
      itemStyle: { opacity: 0 },
      label: { show: false },
    },
  },
  {
    itemStyle: {
      borderColor: "rgba(0,0,0,0.45)",
      borderWidth: 1.5,
      gapWidth: 2,
      borderRadius: 4,
    },
    upperLabel: { show: false },
    // Inherit series-level CHART_EMPHASIS / CHART_BLUR (no per-level color override).
  },
  {
    // Nested ring (sunburst transition / deeper data): slightly vary saturation.
    colorSaturation: [0.4, 0.7],
    itemStyle: {
      borderWidth: 1.5,
      gapWidth: 1,
      borderColorSaturation: 0.5,
      borderRadius: 3,
    },
    upperLabel: { show: false },
  },
];

function kindChipHtml(
  data: ChartNodeData | undefined,
  labels: {
    projectLabel: string;
    workspaceLabel: string;
    runtimeLabel: string;
  },
): string {
  let text: string | null = null;
  if (data?.isAtmosRuntime) text = labels.runtimeLabel;
  else if (data?.isWorkspace) text = labels.workspaceLabel;
  else if (data?.isProject) text = labels.projectLabel;
  if (!text) return "";
  // Match Details muted chip: compact rounded badge next to the name.
  return [
    `<span style="`,
    `display:inline-block;`,
    `flex-shrink:0;`,
    `border-radius:4px;`,
    `padding:1px 6px;`,
    `font-size:10px;`,
    `font-weight:500;`,
    `line-height:1.4;`,
    `color:rgba(250,250,250,0.72);`,
    `background:rgba(255,255,255,0.12);`,
    `border:1px solid rgba(255,255,255,0.1);`,
    `">${escapeHtml(text)}</span>`,
  ].join("");
}

/**
 * Long paths: keep first `head` segments + last `tail` segments, middle as `…`.
 * e.g. `/Users/me/.atmos/workspaces/a/b/c` → `/Users/me/…/a/b/c` (head=2, tail=3).
 */
function middleEllipsisPath(path: string, head = 2, tail = 3): string {
  if (!path || path.startsWith("atmos://")) return path;
  const absolute = path.startsWith("/");
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= head + tail) return path;
  const joined = [...parts.slice(0, head), "…", ...parts.slice(-tail)].join("/");
  return absolute ? `/${joined}` : joined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
