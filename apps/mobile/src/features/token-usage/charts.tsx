import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { matchFont } from "@shopify/react-native-skia";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { Area, CartesianChart, Line, StackedBar, useChartPressState } from "victory-native";
import { spacing } from "@/theme/spacing";
import type { HeatmapWeek } from "@/features/token-usage/model";

const SERIES = ["s0", "s1", "s2", "s3", "s4", "s5"] as const;
type SeriesKey = (typeof SERIES)[number];
type StackRow = { x: number } & Record<SeriesKey, number>;
const SPRING = { type: "spring" as const, duration: 450 };

export function ScrollableChart({
  children,
  height,
}: {
  children: (size: { height: number; width: number }) => ReactNode;
  height: number;
}) {
  const width = Math.max(160, useWindowDimensions().width - spacing.screenX * 2);
  return <View style={{ height, width }}>{children({ height, width })}</View>;
}

export function UsageGrowthChart({
  color,
  formatValue,
  height,
  labels,
  labelColor,
  values,
  width,
}: {
  color: string;
  formatValue: (value: number) => string;
  height: number;
  labels: string[];
  labelColor: string;
  values: number[];
  width: number;
}) {
  const font = matchFont({ fontSize: 11 });
  const { state, isActive } = useChartPressState({ x: 0, y: { y: 0 } });
  const [index, setIndex] = useState(-1);
  useAnimatedReaction(
    () => state.matchedIndex.value,
    (next, previous) => {
      if (next !== previous) runOnJS(setIndex)(next);
    },
  );
  if (values.length === 0) return null;
  const data = values.map((y, x) => ({ x, y }));
  const peak = Math.max(1, ...values);
  const active = isActive && index >= 0 && index < values.length ? index : -1;
  return (
    <View style={{ height, width }}>
      <CartesianChart
        chartPressState={state}
        data={data}
        domain={{ y: [0, peak * 1.08] }}
        domainPadding={{ left: 8, right: 12, top: 16 }}
        explicitSize={{ height, width }}
        frame={{ lineColor: "rgba(113,113,122,0.28)", lineWidth: 1 }}
        padding={{ bottom: 28, left: 56, right: 8, top: 12 }}
        xAxis={{
          axisSide: "bottom",
          font,
          formatXLabel: (value) => xLabel(labels, Number(value)),
          labelColor,
          lineColor: "rgba(113,113,122,0.35)",
          tickCount: Math.min(6, Math.max(1, labels.length)),
        }}
        xKey="x"
        yAxis={[{
          axisSide: "left",
          font,
          formatYLabel: (value) => formatValue(Number(value)),
          labelColor,
          lineColor: "rgba(113,113,122,0.35)",
          tickCount: 4,
        }]}
        yKeys={["y"]}
      >
        {({ chartBounds, points }) => (
          <>
            <Area animate={SPRING} color={color} curveType="monotoneX" opacity={0.22} points={points.y} y0={chartBounds.bottom} />
            <Line animate={SPRING} color={color} curveType="monotoneX" points={points.y} strokeWidth={2} />
          </>
        )}
      </CartesianChart>
      {active >= 0 ? <ChartTip title={labels[active] ?? ""} lines={[formatValue(values[active] ?? 0)]} /> : null}
    </View>
  );
}

export function UsageStackedChart({
  colors,
  formatValue,
  height,
  labels,
  labelColor,
  names,
  series,
  width,
}: {
  colors: string[];
  formatValue: (value: number) => string;
  height: number;
  labels: string[];
  labelColor: string;
  names: string[];
  series: number[][];
  width: number;
}) {
  const font = matchFont({ fontSize: 11 });
  const count = Math.min(SERIES.length, series[0]?.length ?? 0);
  const keys = SERIES.slice(0, count);
  const { state, isActive } = useChartPressState({ x: 0, y: { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 } });
  const [index, setIndex] = useState(-1);
  useAnimatedReaction(
    () => state.matchedIndex.value,
    (next, previous) => {
      if (next !== previous) runOnJS(setIndex)(next);
    },
  );
  if (count === 0) return null;
  const data: StackRow[] = series.map((segments, x) => {
    const row: StackRow = { x, s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    keys.forEach((key, segment) => {
      row[key] = segments[segment] ?? 0;
    });
    return row;
  });
  const peak = Math.max(1, ...data.map((row) => keys.reduce((sum, key) => sum + row[key], 0)));
  const active = isActive && index >= 0 && index < series.length ? index : -1;
  const activeSegments = active >= 0 ? series[active] ?? [] : [];
  return (
    <View style={{ height, width }}>
      <CartesianChart
        chartPressState={state}
        data={data}
        domain={{ y: [0, peak * 1.08] }}
        domainPadding={{ left: 8, right: 12, top: 16 }}
        explicitSize={{ height, width }}
        frame={{ lineColor: "rgba(113,113,122,0.28)", lineWidth: 1 }}
        padding={{ bottom: 28, left: 56, right: 8, top: 12 }}
        xAxis={{
          axisSide: "bottom",
          font,
          formatXLabel: (value) => xLabel(labels, Number(value)),
          labelColor,
          lineColor: "rgba(113,113,122,0.35)",
          tickCount: Math.min(6, Math.max(1, labels.length)),
        }}
        xKey="x"
        yAxis={[{
          axisSide: "left",
          font,
          formatYLabel: (value) => formatValue(Number(value)),
          labelColor,
          lineColor: "rgba(113,113,122,0.35)",
          tickCount: 4,
        }]}
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
      {active >= 0 ? (
        <ChartTip
          lines={names.slice(0, count).map((name, segment) => `${name} ${formatValue(activeSegments[segment] ?? 0)}`)}
          title={labels[active] ?? ""}
        />
      ) : null}
    </View>
  );
}

function xLabel(labels: string[], index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= labels.length) return "";
  const budget = labels.length <= 8 ? labels.length : 5;
  const step = Math.max(1, Math.ceil(labels.length / budget));
  if (index % step !== 0 && index !== labels.length - 1) return "";
  return labels[index] ?? "";
}

function ChartTip({ lines, title }: { lines: string[]; title: string }) {
  return (
    <View pointerEvents="none" style={{ backgroundColor: "rgba(24,24,27,0.92)", borderRadius: 10, gap: 2, paddingHorizontal: 10, paddingVertical: 8, position: "absolute", right: 8, top: 8 }}>
      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={{ color: "#fff", fontSize: 12 }}>{line}</Text>
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
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [weeks]);
  return (
    <ScrollView horizontal nestedScrollEnabled ref={scrollRef} showsHorizontalScrollIndicator={false}>
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
