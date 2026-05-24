"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@workspace/ui";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("Chart components must be used inside <ChartContainer />");
  }

  return context;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
}) {
  const chartId = React.useId();

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={id ?? chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/70 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-default-legend]:flex [&_.recharts-default-legend]:flex-wrap [&_.recharts-default-legend]:gap-4 [&_.recharts-layer:focus-visible]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-text]:fill-foreground [&_.recharts-tooltip-label]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;
export const ChartLegend = RechartsPrimitive.Legend;

type ChartPayloadItem = {
  color?: string;
  dataKey?: string | number;
  name?: string;
  value?: number | string;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: ChartPayloadItem[];
  label?: string | number;
  hideLabel?: boolean;
  formatter?: (value: number | string, name: string, item: ChartPayloadItem) => React.ReactNode;
  labelFormatter?: (label: string | number) => React.ReactNode;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="min-w-44 rounded-xl border border-border/70 bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-xl backdrop-blur">
      {!hideLabel && label !== undefined ? (
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}
      <div className="space-y-2">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "value");
          const labelText = config[key]?.label ?? item.name ?? key;
          const color = item.color ?? config[key]?.color ?? "var(--color-chart-1)";

          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-muted-foreground">{labelText}</span>
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {formatter
                  ? formatter(item.value ?? 0, String(labelText), item)
                  : item.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({
  payload,
}: {
  payload?: ChartPayloadItem[];
}) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "value");
        const label = config[key]?.label ?? item.name ?? key;
        const color = item.color ?? config[key]?.color ?? "var(--color-chart-1)";

        return (
          <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
