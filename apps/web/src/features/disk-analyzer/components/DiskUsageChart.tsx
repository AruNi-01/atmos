"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { DiskNode } from "@/api/ws/disk-analyzer-api";
import { toEChartsTree, type ChartMode } from "@/features/disk-analyzer/lib/tree-adapters";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Props = {
  node: DiskNode;
  rootSize: number;
  mode: ChartMode;
  onSelectPath: (path: string) => void;
  onDrillPath: (path: string) => void;
};

export function DiskUsageChart({ node, rootSize, mode, onSelectPath, onDrillPath }: Props) {
  const data = useMemo(() => toEChartsTree(node, rootSize || node.size || 1), [node, rootSize]);

  const option = useMemo<EChartsOption>(() => {
    if (mode === "treemap") {
      return {
        tooltip: {
          formatter: (params: unknown) => {
            const p = params as {
              name?: string;
              value?: number;
              data?: { path?: string; isProject?: boolean; fileCount?: number; dirCount?: number };
            };
            const size = typeof p.value === "number" ? p.value : 0;
            const share = rootSize > 0 ? ((size / rootSize) * 100).toFixed(1) : "0";
            return [
              `<div><b>${p.name ?? ""}</b>${p.data?.isProject ? " · Atmos" : ""}</div>`,
              `<div>${p.data?.path ?? ""}</div>`,
              `<div>${formatLocal(size)} · ${share}%</div>`,
              `<div>files: ${p.data?.fileCount ?? 0} · dirs: ${p.data?.dirCount ?? 0}</div>`,
            ].join("");
          },
        },
        series: [
          {
            type: "treemap",
            animationDurationUpdate: 500,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            label: {
              show: true,
              formatter: "{b}",
              fontSize: 11,
            },
            upperLabel: { show: true, height: 22 },
            itemStyle: {
              borderColor: "transparent",
              borderWidth: 2,
              gapWidth: 2,
              borderRadius: 6,
            },
            levels: [
              { itemStyle: { borderWidth: 0, gapWidth: 4, borderRadius: 8 } },
              { itemStyle: { gapWidth: 2, borderRadius: 6 } },
            ],
            data: [data],
          },
        ],
      };
    }

    return {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as {
            name?: string;
            value?: number;
            data?: { path?: string; isProject?: boolean; fileCount?: number; dirCount?: number };
          };
          const size = typeof p.value === "number" ? p.value : 0;
          const share = rootSize > 0 ? ((size / rootSize) * 100).toFixed(1) : "0";
          return [
            `<div><b>${p.name ?? ""}</b>${p.data?.isProject ? " · Atmos" : ""}</div>`,
            `<div>${p.data?.path ?? ""}</div>`,
            `<div>${formatLocal(size)} · ${share}%</div>`,
            `<div>files: ${p.data?.fileCount ?? 0} · dirs: ${p.data?.dirCount ?? 0}</div>`,
          ].join("");
        },
      },
      series: [
        {
          type: "sunburst",
          radius: ["12%", "92%"],
          sort: undefined,
          nodeClick: false,
          emphasis: { focus: "ancestor" },
          label: {
            rotate: "radial",
            minAngle: 8,
            fontSize: 10,
          },
          itemStyle: {
            borderRadius: 4,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.35)",
          },
          data: data.children?.length ? data.children : [data],
        },
      ],
    };
  }, [data, mode, rootSize]);

  return (
    <ReactECharts
      option={option}
      style={{ height: "100%", width: "100%", minHeight: 420 }}
      opts={{ renderer: "canvas" }}
      onEvents={{
        click: (params: { data?: { path?: string; isDir?: boolean } }) => {
          const path = params?.data?.path;
          if (!path) return;
          onSelectPath(path);
          if (params.data?.isDir) {
            onDrillPath(path);
          }
        },
      }}
    />
  );
}

function formatLocal(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}
