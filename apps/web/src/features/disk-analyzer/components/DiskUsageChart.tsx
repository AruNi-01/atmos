"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { FolderInput, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import type { DiskNode } from "@/api/ws/disk-analyzer-api";
import {
  SUNBURST_CHART_DEPTH,
  TREEMAP_CHART_DEPTH,
  formatBytes,
  layoutValue,
  toEChartsTree,
  type ChartMode,
  type EChartsTreeDatum,
} from "@/features/disk-analyzer/lib/tree-adapters";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Official treemap ↔ sunburst pattern
 * (https://echarts.apache.org/examples/zh/editor.html?c=treemap-sunburst-transition):
 * one series, stable id, universalTransition, type flips on setOption.
 */
const SERIES_ID = "disk-usage";
const TRANSITION_MS = 1000;

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
  itemStyle: { opacity: 0.35 },
  label: { opacity: 0.45 },
} as const;

type ChartNodeData = {
  path?: string;
  name?: string;
  isDir?: boolean;
  isProject?: boolean;
  isWorkspace?: boolean;
  isGitWorktree?: boolean;
  isAgentData?: boolean;
  isAtmosRuntime?: boolean;
  bytes?: number;
  value?: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  path: string;
  name: string;
  isDir: boolean;
  canDelete: boolean;
};

type ChartHandle = {
  resize: () => void;
  // ECharts dispatchAction payload is a discriminated union with required `type`.
  // Keep a structural type that is assignable from EChartsType without fighting the SDK.
  dispatchAction: (payload: { type: string } & Record<string, unknown>) => void;
};

type Props = {
  node: DiskNode;
  rootSize: number;
  mode: ChartMode;
  scanPath: string;
  projectLabel: string;
  workspaceLabel: string;
  gitWorktreeLabel: string;
  agentDataLabel: string;
  runtimeLabel: string;
  otherLabel?: string;
  enterDirectoryLabel: string;
  deleteLabel: string;
  onSelectPath: (path: string) => void;
  onDrillPath: (path: string) => void;
  onRequestDelete: (path: string) => void;
};

export function DiskUsageChart({
  node,
  rootSize,
  mode,
  scanPath,
  projectLabel,
  workspaceLabel,
  gitWorktreeLabel,
  agentDataLabel,
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
  const chartRef = useRef<ChartHandle | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  /** Treemap: last highlight we applied (index + time). */
  const treemapHoverAppliedRef = useRef<{ index: number; t: number } | null>(
    null,
  );
  /** Coalesce highlight dispatchAction to one per animation frame. */
  const treemapHoverRafRef = useRef(0);
  const treemapHoverPendingRef = useRef<number | null>(null);

  const clearTreemapHover = useCallback(() => {
    if (treemapHoverRafRef.current) {
      cancelAnimationFrame(treemapHoverRafRef.current);
      treemapHoverRafRef.current = 0;
    }
    treemapHoverPendingRef.current = null;
    treemapHoverAppliedRef.current = null;
    chartRef.current?.dispatchAction({
      type: "downplay",
      seriesId: SERIES_ID,
    });
  }, []);

  /**
   * Treemap hover can be cleared by a canvas mouseout (tooltip mount / DOM under
   * cursor) while zrender still thinks the same tile is hovered — so no second
   * mouseover fires and focus/blur stays off until the pointer crosses tiles.
   *
   * Re-dispatch highlight on mousemove (rAF-coalesced). Same tile is re-applied
   * at most every ~80ms so we recover without thrashing state animations.
   */
  const ensureTreemapHover = useCallback((dataIndex: number) => {
    if (modeRef.current !== "treemap") return;
    treemapHoverPendingRef.current = dataIndex;
    if (treemapHoverRafRef.current) return;
    treemapHoverRafRef.current = requestAnimationFrame(() => {
      treemapHoverRafRef.current = 0;
      const idx = treemapHoverPendingRef.current;
      const chart = chartRef.current;
      if (idx == null || !chart || modeRef.current !== "treemap") return;
      const now = performance.now();
      const last = treemapHoverAppliedRef.current;
      // New tile: always apply. Same tile: periodic re-apply recovers after a
      // silent highdown clear without restarting emphasis every frame.
      if (last && last.index === idx && now - last.t < 80) return;
      treemapHoverAppliedRef.current = { index: idx, t: now };
      chart.dispatchAction({
        type: "highlight",
        seriesId: SERIES_ID,
        dataIndex: idx,
      });
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        chartRef.current?.resize();
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

  // Drop forced highlight when leaving treemap (mode switch / unmount).
  useEffect(() => {
    if (mode !== "treemap") clearTreemapHover();
    return () => {
      if (treemapHoverRafRef.current) {
        cancelAnimationFrame(treemapHoverRafRef.current);
        treemapHoverRafRef.current = 0;
      }
    };
  }, [mode, clearTreemapHover]);

  const orderedChildren = useMemo(() => {
    const children = node.children ?? [];
    if (children.length === 0) return [];
    return [...children].sort((a, b) => {
      if (a.size !== b.size) return b.size - a.size;
      return a.name.localeCompare(b.name);
    });
  }, [node]);

  /**
   * Nested tree for both layouts (same structure helps universalTransition).
   * Hierarchical values keep sunburst wedges nested under parents.
   */
  const nestedData = useMemo((): EChartsTreeDatum[] => {
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
      toEChartsTree(
        child,
        chartRootSize,
        {
          maxDepth: SUNBURST_CHART_DEPTH,
          otherLabel,
          valueMode: "hierarchical",
        },
        0,
        i,
      ),
    );
  }, [node, chartRootSize, orderedChildren, otherLabel]);

  /**
   * Treemap leafDepth=1 only paints the first ring. Override first-level `value`
   * to layoutValue(real bytes) so 46GB always outsizes 38GB (hierarchical sum can reverse).
   * Nested children stay for transition morphing into sunburst rings.
   */
  const seriesData = useMemo((): EChartsTreeDatum[] => {
    if (mode !== "treemap") return nestedData;
    return nestedData.map((d) => ({
      ...d,
      value: layoutValue(d.bytes),
    }));
  }, [mode, nestedData]);

  const option = useMemo((): EChartsOption => {
    const tooltipFormatter = (params: unknown) => {
      const p = params as {
        name?: string;
        value?: number | number[];
        data?: ChartNodeData;
      };
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
        gitWorktreeLabel,
        agentDataLabel,
        runtimeLabel,
      });
      const sizeText = escapeHtml(`${formatBytes(size)} · ${share}%`);
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
      trigger: "item" as const,
      formatter: tooltipFormatter,
      borderWidth: 0,
      backgroundColor: "rgba(24,24,27,0.94)",
      textStyle: { color: "rgba(250,250,250,0.95)", fontSize: 12 },
      padding: [8, 12] as [number, number],
      // Instant show/hide — tooltip remount under the cursor can steal mouseout and
      // kill treemap emphasis/blur (region-to-region still works because the tip only updates).
      showDelay: 0,
      hideDelay: 0,
      transitionDuration: 0,
      enterable: false,
      // Parent layout uses overflow:hidden — mount on body so tooltips aren't clipped.
      appendTo: "body",
      // Keep the tip off the cursor. A DOM node inserted under the pointer fires canvas
      // mouseout even with pointer-events:none, which clears focus/blur on first enter.
      position: (
        point: number[],
        _params: unknown,
        _dom: unknown,
        _rect: unknown,
        size?: { contentSize?: number[]; viewSize?: number[] },
      ) => {
        const gap = 14;
        const pw = size?.contentSize?.[0] ?? 0;
        const ph = size?.contentSize?.[1] ?? 0;
        const vw = size?.viewSize?.[0] ?? Number.POSITIVE_INFINITY;
        const vh = size?.viewSize?.[1] ?? Number.POSITIVE_INFINITY;
        let x = point[0] + gap;
        let y = point[1] + gap;
        if (pw > 0 && x + pw > vw) x = Math.max(0, point[0] - pw - gap);
        if (ph > 0 && y + ph > vh) y = Math.max(0, point[1] - ph - gap);
        return [x, y] as [number, number];
      },
      extraCssText:
        "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);pointer-events:none;z-index:10000;",
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

    // Shared series fields — type / layout-only props differ by mode (official demo style).
    const baseSeries = {
      id: SERIES_ID,
      name: "",
      animation: true,
      animationDurationUpdate: TRANSITION_MS,
      animationEasingUpdate: "cubicInOut" as const,
      universalTransition: true,
      nodeClick: false as const,
      cursor: "pointer",
      data: seriesData,
    };

    if (mode === "treemap") {
      return {
        backgroundColor: "transparent",
        tooltip,
        // Avoid hover-layer promotion which can drop first-enter emphasis on dense tiles.
        hoverLayerThreshold: Number.POSITIVE_INFINITY,
        series: [
          {
            ...baseSeries,
            type: "treemap" as const,
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
            roam: false,
            breadcrumb: { show: false },
            leafDepth: TREEMAP_CHART_DEPTH,
            visibleMin: 0,
            // Nested kids exist for sunburst morph → ECharts marks tiles isLeafRoot and
            // prefixes "▶" via drillDownIcon. We drill via our own click handler, not ECharts.
            drillDownIcon: "",
            emphasis: { focus: "self", blurScope: "series", ...CHART_EMPHASIS },
            blur: CHART_BLUR,
            label: {
              show: true,
              silent: true,
              formatter: labelFormatter,
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
          },
        ],
      } as EChartsOption;
    }

    return {
      backgroundColor: "transparent",
      tooltip,
      hoverLayerThreshold: Number.POSITIVE_INFINITY,
      series: [
        {
          ...baseSeries,
          type: "sunburst" as const,
          center: ["50%", "50%"],
          radius: ["12%", "100%"],
          sort: false as const,
          emphasis: { focus: "ancestor", blurScope: "series", ...CHART_EMPHASIS },
          blur: CHART_BLUR,
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
          label: {
            silent: true,
            rotate: "radial",
            minAngle: 8,
            fontSize: 10,
            lineHeight: 13,
            color: "#ffffff",
            formatter: labelFormatter,
          },
          itemStyle: {
            borderRadius: 2,
            borderWidth: 1.5,
            borderColor: "rgba(0,0,0,0.35)",
          },
        },
      ],
    } as EChartsOption;
  }, [
    chartRootSize,
    mode,
    projectLabel,
    runtimeLabel,
    seriesData,
    workspaceLabel,
    gitWorktreeLabel,
    agentDataLabel,
  ]);

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
      x: native?.clientX ?? 0,
      y: native?.clientY ?? 0,
      path,
      name,
      isDir: data?.isDir === true,
      canDelete,
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full overflow-visible [&_canvas]:cursor-pointer"
    >
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        // Same series id + replaceMerge: official treemap↔sunburst morph without residual type.
        notMerge={false}
        replaceMerge={["series"]}
        lazyUpdate={false}
        onChartReady={(instance) => {
          chartRef.current = instance as ChartHandle;
          instance.resize();
        }}
        onEvents={{
          click: (params: { data?: ChartNodeData }) => {
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
          },
          contextmenu: openContextMenu,
          // Treemap: keep focus/blur alive (see ensureTreemapHover).
          mouseover: (params: { dataIndex?: number }) => {
            if (typeof params?.dataIndex === "number") {
              ensureTreemapHover(params.dataIndex);
            }
          },
          mousemove: (params: { dataIndex?: number }) => {
            if (typeof params?.dataIndex === "number") {
              ensureTreemapHover(params.dataIndex);
            }
          },
          mouseout: () => {
            // Tooltip / DOM under cursor can fire mouseout and wipe highdown while
            // the pointer is still on the same tile. Invalidate so the next
            // mousemove re-highlights even without a new mouseover.
            if (modeRef.current === "treemap") {
              treemapHoverAppliedRef.current = null;
            }
          },
          globalout: () => {
            clearTreemapHover();
          },
        }}
      />
      {typeof document !== "undefined"
        ? createPortal(
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
              <DropdownMenuContent align="start" sideOffset={4} className="z-[90] min-w-44">
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
            </DropdownMenu>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Level 0 is the synthetic ECharts root wrapping siblings — keep it invisible.
 * Level 1+ are real directory tiles.
 */
const TREEMAP_LEVELS = [
  {
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
      itemStyle: { borderWidth: 0, color: "transparent" },
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
  },
  {
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
    gitWorktreeLabel: string;
    agentDataLabel: string;
    runtimeLabel: string;
  },
): string {
  let text: string | null = null;
  if (data?.isAtmosRuntime) text = labels.runtimeLabel;
  else if (data?.isWorkspace) text = labels.workspaceLabel;
  else if (data?.isProject) text = labels.projectLabel;
  else if (data?.isGitWorktree) text = labels.gitWorktreeLabel;
  else if (data?.isAgentData) text = labels.agentDataLabel;
  if (!text) return "";
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
