import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Area, CartesianChart, Line, StackedBar } from "victory-native";
import { spacing } from "@/theme/spacing";
import type { HeatmapWeek } from "@/features/token-usage/model";

const SERIES = ["s0", "s1", "s2", "s3", "s4", "s5"] as const;
type SeriesKey = (typeof SERIES)[number];
type StackRow = { x: number } & Record<SeriesKey, number>;
const SPRING = { type: "spring" as const, duration: 450 };

export function ScrollableChart({
  children,
  height,
  pointCount,
  pointWidth,
}: {
  children: (size: { height: number; width: number }) => ReactNode;
  height: number;
  pointCount: number;
  pointWidth: number;
}) {
  const viewport = Math.max(160, useWindowDimensions().width - spacing.screenX * 2);
  const width = Math.max(viewport, Math.max(1, pointCount) * pointWidth);
  const chart = <View style={{ height, width }}>{children({ height, width })}</View>;
  if (width <= viewport + 1) return chart;
  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
      {chart}
    </ScrollView>
  );
}

export function UsageGrowthChart({
  color,
  height,
  values,
  width,
}: {
  color: string;
  height: number;
  values: number[];
  width: number;
}) {
  if (values.length === 0) return null;
  const data = values.map((y, x) => ({ x, y }));
  const peak = Math.max(1, ...values);
  return (
    <CartesianChart
      data={data}
      domain={{ y: [0, peak * 1.08] }}
      domainPadding={{ left: 10, right: 10, top: 16 }}
      explicitSize={{ height, width }}
      padding={{ bottom: 4, left: 0, right: 0, top: 8 }}
      xKey="x"
      yKeys={["y"]}
    >
      {({ chartBounds, points }) => (
        <>
          <Area animate={SPRING} color={color} curveType="monotoneX" opacity={0.22} points={points.y} y0={chartBounds.bottom} />
          <Line animate={SPRING} color={color} curveType="monotoneX" points={points.y} strokeWidth={2} />
        </>
      )}
    </CartesianChart>
  );
}

export function UsageStackedChart({
  colors,
  height,
  series,
  width,
}: {
  colors: string[];
  height: number;
  series: number[][];
  width: number;
}) {
  const count = Math.min(SERIES.length, series[0]?.length ?? 0);
  if (count === 0) return null;
  const keys = SERIES.slice(0, count);
  const data: StackRow[] = series.map((segments, x) => {
    const row: StackRow = { x, s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    keys.forEach((key, index) => {
      row[key] = segments[index] ?? 0;
    });
    return row;
  });
  const peak = Math.max(1, ...data.map((row) => keys.reduce((sum, key) => sum + row[key], 0)));
  return (
    <CartesianChart
      data={data}
      domain={{ y: [0, peak * 1.08] }}
      domainPadding={{ left: 12, right: 12, top: 12 }}
      explicitSize={{ height, width }}
      padding={{ bottom: 4, left: 0, right: 0, top: 4 }}
      xKey="x"
      yKeys={keys}
    >
      {({ chartBounds, points }) => (
        <StackedBar
          animate={SPRING}
          barOptions={({ isTop }) => ({ roundedCorners: isTop ? { topLeft: 4, topRight: 4 } : undefined })}
          chartBounds={chartBounds}
          colors={colors.slice(0, count)}
          innerPadding={0.35}
          points={keys.map((key) => points[key])}
        />
      )}
    </CartesianChart>
  );
}

export function ChartAxisLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  const step = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <View style={{ flexDirection: "row" }}>
      {labels.map((label, index) => (
        <Text
          key={`${label}-${index}`}
          numberOfLines={1}
          style={{ color: "#71717a", flex: 1, fontSize: 10, opacity: index % step === 0 || index === labels.length - 1 ? 1 : 0, textAlign: "center" }}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

const CELL = 12;
const GAP = 3;

export function UsageHeatmap({
  monthLabels,
  onSelect,
  palette,
  selectedDate,
  weekdayColor,
  weeks,
}: {
  monthLabels: Array<{ label: string; weekIndex: number }>;
  onSelect: (date: string) => void;
  palette: readonly string[];
  selectedDate: string | null;
  weekdayColor: string;
  weeks: HeatmapWeek[];
}) {
  const column = CELL + GAP;
  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ height: 16, marginLeft: 32, width: weeks.length * column }}>
          {monthLabels.map((month) => (
            <Text key={`${month.label}-${month.weekIndex}`} style={{ color: weekdayColor, fontSize: 10, left: month.weekIndex * column, position: "absolute" }}>
              {month.label}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row" }}>
          <View style={{ height: 7 * column, width: 32 }}>
            {[
              ["Mon", 1],
              ["Wed", 3],
              ["Fri", 5],
            ].map(([label, row]) => (
              <Text key={label} style={{ color: weekdayColor, fontSize: 10, position: "absolute", top: Number(row) * column }}>
                {label}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: GAP }}>
            {weeks.map((week) => (
              <View key={week.cells[0]?.date ?? "week"} style={{ gap: GAP }}>
                {week.cells.map((cell) => {
                  const blank = cell.count === null;
                  return (
                    <Pressable
                      disabled={blank}
                      key={cell.date}
                      onPress={() => onSelect(cell.date)}
                      style={{
                        backgroundColor: blank ? "transparent" : palette[cell.level],
                        borderColor: cell.date === selectedDate ? weekdayColor : "transparent",
                        borderRadius: 2,
                        borderWidth: cell.date === selectedDate ? 1 : 0,
                        height: CELL,
                        width: CELL,
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
