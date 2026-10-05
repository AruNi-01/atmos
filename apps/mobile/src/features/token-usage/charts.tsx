import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { matchFont, type SkFont } from "@shopify/react-native-skia";
import { Gesture, GestureDetector, ScrollView as GestureScrollView, type GestureType } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { METRIC_TWEEN_MS } from "@/features/token-usage/tween-series";
import { useMorphedSeries } from "@/features/token-usage/use-morphed-series";
import { scheduleOnRN } from "react-native-worklets";
import { Area, CartesianChart, Line, StackedBar } from "victory-native";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import type { HeatmapWeek, UsageDimension } from "@/features/token-usage/model";
import { UsageModelIcon } from "@/features/token-usage/UsageModelIcon";
import { BotIcon } from "@/ui/icons/lucide-native";

const SERIES = ["s0", "s1", "s2", "s3", "s4", "s5"] as const;
type SeriesKey = (typeof SERIES)[number];
type StackRow = { x: number } & Record<SeriesKey, number>;
const AXIS_LINE = "rgba(113,113,122,0.35)";
const CHART_PADDING = { bottom: 28, left: 0, right: 8, top: 12 };
const DOMAIN_PADDING = { bottom: 0, left: 8, right: 12, top: 16 };
const X_FRAME = {
  lineColor: AXIS_LINE,
  lineWidth: { bottom: StyleSheet.hairlineWidth, left: 0, right: 0, top: 0 },
};
const NO_INSET = { bottom: 0, left: 0, right: 0, top: 0 };
const POINT_SLOT_MIN = 44;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const TIP_MOVE = { duration: 200, easing: EASE_IN_OUT };
/**
 * Skia backs the chart with a texture of points × screen scale. One surface past the
 * GPU limit draws blank, which is what Day view did with a full year on one canvas.
 * 4096 device pixels stays under the common 4096–16384 limits, including a 3x phone.
 */
const MAX_TEXTURE_PX = 4096;

function maxCanvasPoints() {
  return Math.max(320, Math.floor(MAX_TEXTURE_PX / Math.max(1, PixelRatio.get())));
}

type PlotChunk = {
  end: number;
  leftInset: number;
  overlap: boolean;
  rightInset: number;
  start: number;
  width: number;
};
const WEEKDAY_COLUMN = 32;
const MONTH_LABEL_HEIGHT = 16;

function labelWidth(font: SkFont, text: string) {
  return font.measureText(text).width ?? 0;
}

function estimateGutter(font: SkFont, format: (value: number) => string, peak: number) {
  const top = Math.max(1, peak);
  let widest = 28;
  for (const value of [0, top / 2, top]) widest = Math.max(widest, labelWidth(font, format(value)));
  return Math.ceil(widest + 12);
}

function pointSlot(font: SkFont, labels: string[]) {
  let widest = POINT_SLOT_MIN;
  for (const label of labels) widest = Math.max(widest, labelWidth(font, label));
  return Math.max(POINT_SLOT_MIN, Math.ceil(widest + 14));
}

function buildChunks(count: number, slot: number, mode: "line" | "bars", viewport: number): PlotChunk[] {
  if (count <= 0) return [];
  const inset = Math.min(slot / 2, 28);
  const per = Math.max(1, Math.floor((maxCanvasPoints() - slot) / slot));
  const chunks: PlotChunk[] = [];
  for (let start = 0; start < count; start += per) {
    const end = Math.min(count, start + per);
    const overlap = mode === "line" && start > 0;
    const drawn = end - start + (overlap ? 1 : 0);
    const leftInset = drawn <= 1 ? 0 : mode === "bars" || start === 0 ? inset : 0;
    const rightInset = drawn <= 1 ? 0 : mode === "bars" || end === count ? inset : 0;
    const width = drawn <= 1 ? slot : mode === "bars" ? drawn * slot : (drawn - 1) * slot + leftInset + rightInset;
    chunks.push({ end, leftInset, overlap, rightInset, start, width });
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.width, 0);
  const only = chunks[0];
  if (chunks.length === 1 && only && total < viewport) only.width = Math.min(viewport, maxCanvasPoints());
  return chunks;
}

function pointX(chunk: PlotChunk, index: number) {
  const drawnStart = chunk.overlap ? chunk.start - 1 : chunk.start;
  const drawn = chunk.end - drawnStart;
  const span = chunk.width - chunk.leftInset - chunk.rightInset;
  if (drawn <= 1) return chunk.leftInset + span / 2;
  return chunk.leftInset + ((index - drawnStart) / (drawn - 1)) * span;
}

function indexAt(contentX: number, chunks: PlotChunk[]) {
  let offset = 0;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const chunk of chunks) {
    for (let index = chunk.start; index < chunk.end; index += 1) {
      const dist = Math.abs(contentX - (offset + pointX(chunk, index)));
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    }
    offset += chunk.width;
  }
  return best;
}

function nearestMark(marks: number[], x: number) {
  "worklet";
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index];
    if (mark === undefined) continue;
    const dist = Math.abs(x - mark);
    if (dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  }
  return best;
}

function usePlotHold(count: number, resetKey: string, geometryKey: string, scrollX: { current: number }, viewport: { current: number }, chunks: { current: PlotChunk[] }) {
  const [held, setHeld] = useState<number | null>(null);
  const [side, setSide] = useState<"left" | "right">("right");
  const open = useSharedValue(false);
  const scrubbing = useSharedValue(false);
  const rejected = useSharedValue(false);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const marks = useSharedValue<number[]>([]);
  const scrollXShared = useSharedValue(0);
  const viewportShared = useSharedValue(0);
  const lastIndex = useSharedValue(-1);
  const lastRight = useSharedValue(true);
  const heldRef = useRef<number | null>(null);
  const sideRef = useRef<"left" | "right">("right");
  const countRef = useRef(count);
  const scrubRef = useRef<GestureType | undefined>(undefined);
  countRef.current = count;
  const apply = useCallback((index: number, right: boolean, toggle: boolean) => {
    if (countRef.current <= 0) return;
    const nextSide: "left" | "right" = right ? "right" : "left";
    const current = heldRef.current;
    const picked = toggle && current === index ? null : index;
    const resolved = picked !== null && picked >= countRef.current ? null : picked;
    if (current === resolved && (resolved === null || sideRef.current === nextSide)) return;
    heldRef.current = resolved;
    sideRef.current = nextSide;
    open.set(resolved !== null);
    lastIndex.set(resolved ?? -1);
    lastRight.set(nextSide === "right");
    setHeld(resolved);
    setSide(nextSide);
  }, [lastIndex, lastRight, open]);
  const onTapRef = useRef<(x: number) => void>(() => {});
  const onScrubRef = useRef<(index: number, right: boolean) => void>(() => {});
  onTapRef.current = (x: number) => {
    apply(indexAt(x, chunks.current), x - scrollX.current < viewport.current / 2, true);
  };
  onScrubRef.current = (index: number, right: boolean) => {
    apply(index, right, false);
  };
  const tapJS = useCallback((x: number) => {
    onTapRef.current(x);
  }, []);
  const scrubJS = useCallback((index: number, right: boolean) => {
    onScrubRef.current(index, right);
  }, []);
  const noteScroll = useCallback((x: number) => {
    scrollX.current = x;
    scrollXShared.set(x);
  }, [scrollX, scrollXShared]);
  useEffect(() => {
    viewportShared.set(viewport.current);
  }, [geometryKey, viewport, viewportShared]);
  useEffect(() => {
    const xs: number[] = [];
    let offset = 0;
    for (const chunk of chunks.current) {
      for (let index = chunk.start; index < chunk.end; index += 1) {
        xs[index] = offset + pointX(chunk, index);
      }
      offset += chunk.width;
    }
    marks.set(xs);
  }, [chunks, geometryKey, marks]);
  const gesture = useMemo(() => Gesture.Pan()
    .manualActivation(true)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .withRef(scrubRef)
    .onTouchesDown((event) => {
      "worklet";
      const touch = event.allTouches[0];
      rejected.set(false);
      scrubbing.set(false);
      if (!touch) return;
      originX.set(touch.x);
      originY.set(touch.y);
    })
    .onTouchesMove((event, manager) => {
      "worklet";
      const touch = event.allTouches[0];
      if (!touch) return;
      const dx = touch.x - originX.get();
      const dy = touch.y - originY.get();
      if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) {
        rejected.set(true);
        manager.fail();
        return;
      }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      if (!open.get()) {
        rejected.set(true);
        manager.fail();
        return;
      }
      if (scrubbing.get()) return;
      scrubbing.set(true);
      manager.activate();
    })
    .onTouchesUp((event, manager) => {
      "worklet";
      if (scrubbing.get()) return;
      manager.fail();
      if (rejected.get()) return;
      const touch = event.changedTouches[0] ?? event.allTouches[0];
      if (!touch) return;
      if (Math.abs(touch.x - originX.get()) > 12 || Math.abs(touch.y - originY.get()) > 12) return;
      scheduleOnRN(tapJS, touch.x);
    })
    .onUpdate((event) => {
      "worklet";
      const xs = marks.get();
      if (xs.length === 0) return;
      const index = nearestMark(xs, event.x);
      const right = event.x - scrollXShared.get() < viewportShared.get() / 2;
      if (index === lastIndex.get() && right === lastRight.get()) return;
      lastIndex.set(index);
      lastRight.set(right);
      scheduleOnRN(scrubJS, index, right);
    })
    .onFinalize(() => {
      "worklet";
      scrubbing.set(false);
    }), [lastIndex, lastRight, marks, open, originX, originY, rejected, scrubJS, scrubbing, scrollXShared, tapJS, viewportShared]);
  const clear = useCallback(() => {
    if (heldRef.current === null) return;
    heldRef.current = null;
    open.set(false);
    lastIndex.set(-1);
    setHeld(null);
  }, [lastIndex, open]);
  useEffect(() => {
    clear();
  }, [clear, resetKey]);
  return { clear, gesture, held: held !== null && held < count ? held : null, noteScroll, scrubbing, scrubRef, side };
}

export function ScrollableChart({
  children,
  height,
}: {
  children: (size: { height: number; width: number }) => ReactNode;
  height: number;
}) {
  const [width, setWidth] = useState(0);
  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
      }}
      style={{ alignSelf: "stretch", height, overflow: "hidden", width: "100%" }}
    >
      {width > 0 ? children({ height, width }) : null}
    </View>
  );
}

type TipRow = { icon?: ReactNode; key: string; label: string; value?: string };

function seriesMark(dimension: UsageDimension, id: string, color: string, providerId?: string) {
  if (dimension === "model") return <UsageModelIcon color={color} modelId={id} providerId={providerId} size={14} />;
  if (id === "other") return <BotIcon color={color} size={14} />;
  return <MobileAgentIcon agentId={id} size={14} />;
}

function ChartTip({
  gutter,
  open,
  rows,
  side,
  title,
  width,
}: {
  gutter: number;
  open: boolean;
  rows: TipRow[];
  side: "left" | "right";
  title: string;
  width: number;
}) {
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.96);
  const translateY = useSharedValue(reducedMotion ? 0 : 4);
  const textOpacity = useSharedValue(1);
  const wasOpen = useRef(false);
  const seenTitle = useRef(false);
  const titleAt = useRef(0);
  const [boxWidth, setBoxWidth] = useState(0);
  const left = gutter + 8;
  const plot = Math.max(0, width - gutter);
  const moveStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const presenceStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: translateY.get() }, { scale: scale.get() }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.get() }));
  useEffect(() => {
    if (boxWidth <= 0) return;
    const target = side === "right" ? Math.max(0, width - 8 - boxWidth - left) : 0;
    const animate = wasOpen.current && open && !reducedMotion;
    wasOpen.current = open;
    translateX.set(animate ? withTiming(target, TIP_MOVE) : target);
  }, [boxWidth, left, open, reducedMotion, side, translateX, width]);
  useEffect(() => {
    const duration = reducedMotion ? (open ? 120 : 80) : (open ? 180 : 140);
    const timing = { duration, easing: EASE_OUT };
    opacity.set(withTiming(open ? 1 : 0, timing));
    if (reducedMotion) {
      scale.set(1);
      translateY.set(0);
      return;
    }
    scale.set(withTiming(open ? 1 : 0.96, timing));
    translateY.set(withTiming(open ? 0 : 4, timing));
  }, [opacity, open, reducedMotion, scale, translateY]);
  useEffect(() => {
    if (!open) {
      seenTitle.current = false;
      titleAt.current = 0;
      textOpacity.set(1);
      return;
    }
    const now = Date.now();
    const burst = now - titleAt.current < 480;
    titleAt.current = now;
    if (!seenTitle.current || reducedMotion || burst) {
      seenTitle.current = true;
      textOpacity.set(1);
      return;
    }
    textOpacity.set(withSequence(
      withTiming(0.35, { duration: 80, easing: EASE_OUT }),
      withTiming(1, { duration: 140, easing: EASE_OUT }),
    ));
  }, [open, reducedMotion, textOpacity, title]);
  return (
    <Animated.View collapsable={false} pointerEvents="none" style={[{ left, position: "absolute", top: 8, zIndex: 2 }, moveStyle]}>
      <Animated.View
        collapsable={false}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          setBoxWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
        }}
        style={[
          {
            backgroundColor: "rgba(24,24,27,0.92)",
            borderRadius: 10,
            maxWidth: Math.max(120, plot / 2 - 16),
            paddingHorizontal: 10,
            paddingVertical: 8,
          },
          presenceStyle,
        ]}
      >
        <Animated.View style={[{ gap: 4 }, textStyle]}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{title}</Text>
          {rows.map((row) => (
            <View key={row.key} style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              {row.icon}
              <Text numberOfLines={1} style={{ color: "#fff", flexShrink: 1, fontSize: 12 }}>{row.label}</Text>
              {row.value ? <Text style={{ color: "#fff", fontSize: 12, fontVariant: ["tabular-nums"] }}>{row.value}</Text> : null}
            </View>
          ))}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function PinnedYAxis({
  domainY,
  font,
  formatValue,
  height,
  labelColor,
  onFrame,
  width,
}: {
  domainY: [number, number];
  font: SkFont;
  formatValue: (value: number) => string;
  height: number;
  labelColor: string;
  onFrame: (frame: { bottom: number; left: number; top: number }) => void;
  width: number;
}) {
  const data = [{ x: 0, y: domainY[0] }, { x: 1, y: domainY[1] }];
  return (
    <CartesianChart
      data={data}
      domain={{ y: domainY }}
      domainPadding={{ bottom: 0, left: 0, right: 0, top: DOMAIN_PADDING.top }}
      explicitSize={{ height, width: width + 2 }}
      frame={{ lineColor: "transparent", lineWidth: 0 }}
      onChartBoundsChange={(bounds) => onFrame({ bottom: bounds.bottom, left: bounds.left, top: bounds.top })}
      padding={CHART_PADDING}
      xAxis={{
        font,
        formatXLabel: () => " ",
        labelColor: "transparent",
        lineColor: "transparent",
        lineWidth: 0,
        tickCount: 2,
      }}
      xKey="x"
      yAxis={[{
        axisSide: "left",
        font,
        formatYLabel: (value) => formatValue(Number(value)),
        labelColor,
        lineColor: "transparent",
        lineWidth: 0,
        tickCount: 4,
      }]}
      yKeys={["y"]}
    >
      {() => null}
    </CartesianChart>
  );
}

const PLOT_PADDING = { bottom: CHART_PADDING.bottom, left: 0, right: 0, top: CHART_PADDING.top };

function AxisScroll({
  domainY,
  formatValue,
  height,
  labelColor,
  labels,
  mode,
  plot,
  resetKey,
  tip,
  viewportWidth,
}: {
  domainY: [number, number];
  formatValue: (value: number) => string;
  height: number;
  labelColor: string;
  labels: string[];
  mode: "line" | "bars";
  plot: (chunk: PlotChunk) => ReactNode;
  resetKey: string;
  tip: (index: number, side: "left" | "right", gutter: number, open: boolean) => ReactNode;
  viewportWidth: number;
}) {
  const font = matchFont({ fontSize: 11 });
  const scrollRef = useRef<GestureScrollView>(null);
  const scrollX = useRef(0);
  const plotViewportRef = useRef(0);
  const contentWidthRef = useRef(0);
  const chunksRef = useRef<PlotChunk[]>([]);
  const userScrolled = useRef(false);
  const [gutter, setGutter] = useState(() => estimateGutter(font, formatValue, domainY[1]));
  const [axisSpan, setAxisSpan] = useState({ bottom: height - CHART_PADDING.bottom, top: CHART_PADDING.top });
  const plotViewport = Math.max(0, viewportWidth - gutter);
  const chunks = buildChunks(labels.length, pointSlot(font, labels), mode, plotViewport);
  const contentWidth = chunks.reduce((sum, chunk) => sum + chunk.width, 0);
  plotViewportRef.current = plotViewport;
  contentWidthRef.current = contentWidth;
  chunksRef.current = chunks;
  const geometryKey = `${labels.length}:${Math.round(contentWidth)}:${Math.round(plotViewport)}`;
  const { clear, gesture, held, noteScroll, scrubbing, scrubRef, side } = usePlotHold(labels.length, resetKey, geometryKey, scrollX, plotViewportRef, chunksRef);
  const tipFrame = useRef<{ gutter: number; index: number; side: "left" | "right" } | null>(null);
  if (held !== null) tipFrame.current = { gutter, index: held, side };
  const frame = tipFrame.current;
  const onFrame = useCallback((frame: { bottom: number; left: number; top: number }) => {
    const next = Math.ceil(frame.left);
    if (next > 0) setGutter((current) => (Math.abs(current - next) < 1 ? current : next));
    setAxisSpan((current) => (current.top === frame.top && current.bottom === frame.bottom ? current : { bottom: frame.bottom, top: frame.top }));
  }, []);
  const pinToLatest = useCallback(() => {
    if (userScrolled.current) return;
    const x = Math.max(0, contentWidthRef.current - plotViewportRef.current);
    noteScroll(x);
    scrollRef.current?.scrollTo({ animated: false, x });
  }, [noteScroll]);
  useEffect(() => {
    userScrolled.current = false;
    const frame = requestAnimationFrame(() => pinToLatest());
    return () => cancelAnimationFrame(frame);
  }, [labels.length, pinToLatest, viewportWidth]);
  let labelOffset = 0;
  return (
    <View collapsable={false} style={{ height, overflow: "hidden", width: viewportWidth }}>
      <View style={{ flexDirection: "row", height, width: viewportWidth }}>
        <View pointerEvents="none" style={{ height, overflow: "hidden", width: gutter }}>
          <PinnedYAxis domainY={domainY} font={font} formatValue={formatValue} height={height} labelColor={labelColor} onFrame={onFrame} width={gutter} />
          <View
            style={{
              backgroundColor: AXIS_LINE,
              bottom: height - axisSpan.bottom,
              position: "absolute",
              right: 0,
              top: axisSpan.top,
              width: StyleSheet.hairlineWidth,
            }}
          />
        </View>
        <GestureScrollView
          automaticallyAdjustContentInsets={false}
          contentInset={NO_INSET}
          contentInsetAdjustmentBehavior="never"
          directionalLockEnabled
          horizontal
          nestedScrollEnabled
          onContentSizeChange={(width) => {
            if (width <= plotViewport + 1) return;
            pinToLatest();
          }}
          onScroll={(event) => {
            noteScroll(event.nativeEvent.contentOffset.x);
          }}
          onScrollBeginDrag={() => {
            if (scrubbing.get()) return;
            userScrolled.current = true;
            clear();
          }}
          ref={scrollRef}
          scrollEnabled={held === null}
          waitFor={scrubRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={{ height, width: plotViewport }}
        >
          <GestureDetector gesture={gesture}>
            <View collapsable={false} style={{ height, width: contentWidth }}>
              <View style={{ flexDirection: "row", height }}>
                {chunks.map((chunk) => (
                  <View key={chunk.start} style={{ height, width: chunk.width }}>
                    {plot(chunk)}
                  </View>
                ))}
              </View>
              <View pointerEvents="none" style={{ height: height - axisSpan.bottom, left: 0, position: "absolute", right: 0, top: axisSpan.bottom }}>
                {chunks.map((chunk) => {
                  const nodes = [];
                  for (let index = chunk.start; index < chunk.end; index += 1) {
                    const label = labels[index] ?? "";
                    if (!label) continue;
                    const textWidth = Math.max(1, Math.ceil(labelWidth(font, label)));
                    const center = labelOffset + pointX(chunk, index);
                    const left = Math.min(Math.max(0, center - textWidth / 2), Math.max(0, contentWidth - textWidth));
                    nodes.push(
                      <Text key={index} numberOfLines={1} style={{ color: labelColor, fontSize: 11, left, position: "absolute", textAlign: "center", top: 3, width: textWidth }}>
                        {label}
                      </Text>,
                    );
                  }
                  labelOffset += chunk.width;
                  return nodes;
                })}
              </View>
            </View>
          </GestureDetector>
        </GestureScrollView>
      </View>
      {frame ? tip(frame.index, frame.side, frame.gutter, held !== null) : null}
    </View>
  );
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
  const reducedMotion = useReducedMotion();
  const drawn = useMorphedSeries(values.map((value) => [value]), Boolean(reducedMotion));
  const font = matchFont({ fontSize: 11 });
  if (values.length === 0 || labels.length === 0) return null;
  const peak = Math.max(1, ...values);
  const domainY: [number, number] = [0, peak * 1.08];
  return (
    <AxisScroll
      domainY={domainY}
      formatValue={formatValue}
      height={height}
      labelColor={labelColor}
      labels={labels}
      mode="line"
      plot={(chunk) => {
        const from = chunk.overlap ? chunk.start - 1 : chunk.start;
        const slice = drawn.slice(from, chunk.end).map((row, x) => ({ x, y: row[0] ?? 0 }));
        return (
          <CartesianChart
            data={slice}
            domain={{ y: domainY }}
            domainPadding={{ bottom: 0, left: chunk.leftInset, right: chunk.rightInset, top: DOMAIN_PADDING.top }}
            explicitSize={{ height, width: chunk.width }}
            frame={X_FRAME}
            padding={PLOT_PADDING}
            xAxis={{
              axisSide: "bottom",
              font,
              formatXLabel: () => " ",
              labelColor: "transparent",
              lineColor: "transparent",
              lineWidth: 0,
              tickCount: 2,
            }}
            xKey="x"
            yAxis={[{
              axisSide: "left",
              font: null,
              formatYLabel: (value) => formatValue(Number(value)),
              labelColor: "transparent",
              lineColor: "transparent",
              lineWidth: 0,
              tickCount: 4,
            }]}
            yKeys={["y"]}
          >
            {({ chartBounds, points }) => (
              <>
                <Area color={color} curveType="monotoneX" opacity={0.22} points={points.y} y0={chartBounds.bottom} />
                <Line color={color} curveType="monotoneX" points={points.y} strokeWidth={2} />
              </>
            )}
          </CartesianChart>
        );
      }}
      resetKey={labels.join("\u0000")}
      tip={(index, side, gutter, open) => (
        <ChartTip gutter={gutter} open={open} rows={[{ key: "value", label: formatValue(values[index] ?? 0) }]} side={side} title={labels[index] ?? ""} width={width} />
      )}
      viewportWidth={width}
    />
  );
}

export function UsageStackedChart({
  colors,
  dimension,
  formatValue,
  height,
  ids,
  labels,
  labelColor,
  names,
  providers,
  series,
  width,
}: {
  colors: string[];
  dimension: UsageDimension;
  formatValue: (value: number) => string;
  height: number;
  ids: string[];
  labels: string[];
  labelColor: string;
  names: string[];
  providers?: ReadonlyMap<string, string>;
  series: number[][];
  width: number;
}) {
  const reducedMotion = useReducedMotion();
  const drawn = useMorphedSeries(series, Boolean(reducedMotion));
  const rememberedColors = useRef(colors);
  const font = matchFont({ fontSize: 11 });
  const segmentCount = Math.min(
    SERIES.length,
    Math.max(series[0]?.length ?? 0, drawn[0]?.length ?? 0),
  );
  const keys = SERIES.slice(0, segmentCount);
  if (segmentCount === 0 || labels.length === 0) return null;
  const paint = colors.slice(0, segmentCount);
  for (let index = paint.length; index < segmentCount; index += 1) {
    paint.push(rememberedColors.current[index] ?? paint[paint.length - 1] ?? "#94A3B8");
  }
  rememberedColors.current = paint;
  const data: StackRow[] = drawn.map((segments, x) => {
    const row: StackRow = { x, s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    keys.forEach((key, segment) => {
      row[key] = segments[segment] ?? 0;
    });
    return row;
  });
  const peak = Math.max(1, ...series.map((row) => row.reduce((sum, value) => sum + value, 0)));
  const domainY: [number, number] = [0, peak * 1.08];
  return (
    <AxisScroll
      domainY={domainY}
      formatValue={formatValue}
      height={height}
      labelColor={labelColor}
      labels={labels}
      mode="bars"
      plot={(chunk) => {
        const slice = data.slice(chunk.start, chunk.end).map((row, x) => ({ ...row, x }));
        return (
          <CartesianChart
            data={slice}
            domain={{ y: domainY }}
            domainPadding={{ bottom: 0, left: chunk.leftInset, right: chunk.rightInset, top: DOMAIN_PADDING.top }}
            explicitSize={{ height, width: chunk.width }}
            frame={X_FRAME}
            padding={PLOT_PADDING}
            xAxis={{
              axisSide: "bottom",
              font,
              formatXLabel: () => " ",
              labelColor: "transparent",
              lineColor: "transparent",
              lineWidth: 0,
              tickCount: 2,
            }}
            xKey="x"
            yAxis={[{
              axisSide: "left",
              font: null,
              formatYLabel: (value) => formatValue(Number(value)),
              labelColor: "transparent",
              lineColor: "transparent",
              lineWidth: 0,
              tickCount: 4,
            }]}
            yKeys={keys}
          >
            {({ chartBounds, points }) => (
              <StackedBar
                barOptions={({ isTop }) => ({ roundedCorners: isTop ? { topLeft: 4, topRight: 4 } : undefined })}
                chartBounds={chartBounds}
                colors={paint}
                innerPadding={0.35}
                points={keys.map((key) => points[key])}
              />
            )}
          </CartesianChart>
        );
      }}
      resetKey={`${ids.join("\u0000")}:${labels.join("\u0000")}`}
      tip={(index, side, gutter, open) => {
        const segments = series[index] ?? [];
        const rows = ids.slice(0, segmentCount).flatMap((id, segment) => {
          const amount = segments[segment] ?? 0;
          if (amount <= 0) return [];
          return [{
            icon: seriesMark(dimension, id, colors[segment] ?? "#fff", providers?.get(id)),
            key: id || String(segment),
            label: names[segment] ?? id,
            value: formatValue(amount),
          }];
        });
        return (
          <ChartTip
            gutter={gutter}
            open={open}
            rows={rows.length > 0 ? rows : [{ key: "empty", label: formatValue(0) }]}
            side={side}
            title={labels[index] ?? ""}
            width={width}
          />
        );
      }}
      viewportWidth={width}
    />
  );
}

const CELL = 12;
const GAP = 3;

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function latestInYearWeek(weeks: HeatmapWeek[], today: string) {
  let latest = -1;
  for (let index = 0; index < weeks.length; index += 1) {
    const cells = weeks[index]?.cells ?? [];
    if (cells.some((cell) => cell.count !== null && cell.date <= today)) latest = index;
  }
  return latest;
}

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
  const reducedMotion = useReducedMotion();
  const column = CELL + GAP;
  const scrollRef = useRef<ScrollView>(null);
  const userScrolled = useRef(false);
  const [plotWidth, setPlotWidth] = useState(0);
  const gridWidth = weeks.length * column;
  const today = localDateKey();
  const latestIndex = useMemo(() => latestInYearWeek(weeks, today), [today, weeks]);
  const placeLatest = useCallback(() => {
    if (userScrolled.current || latestIndex < 0 || plotWidth <= 0 || gridWidth <= plotWidth + 1) return;
    const maxOffset = Math.max(0, gridWidth - plotWidth);
    const latestRight = (latestIndex + 1) * CELL + latestIndex * GAP;
    const offset = Math.min(maxOffset, Math.max(0, latestRight - plotWidth * 0.75));
    scrollRef.current?.scrollTo({ animated: false, x: offset });
  }, [gridWidth, latestIndex, plotWidth]);
  useEffect(() => {
    userScrolled.current = false;
    const frame = requestAnimationFrame(placeLatest);
    return () => cancelAnimationFrame(frame);
  }, [placeLatest]);
  return (
    <View style={{ alignSelf: "stretch", flexDirection: "row", overflow: "hidden", width: "100%" }}>
      <View style={{ width: WEEKDAY_COLUMN }}>
        <View style={{ height: MONTH_LABEL_HEIGHT }} />
        <View style={{ height: 7 * column }}>
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
      </View>
      <View
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          setPlotWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
        }}
        style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
      >
        {plotWidth > 0 ? (
          <ScrollView
            automaticallyAdjustContentInsets={false}
            contentInset={NO_INSET}
            contentInsetAdjustmentBehavior="never"
            directionalLockEnabled
            horizontal
            nestedScrollEnabled
            onContentSizeChange={placeLatest}
            onScrollBeginDrag={() => {
              userScrolled.current = true;
            }}
            ref={scrollRef}
            showsHorizontalScrollIndicator={false}
            style={{ width: plotWidth }}
          >
            <View style={{ width: Math.max(plotWidth, gridWidth) }}>
              <View style={{ height: MONTH_LABEL_HEIGHT, width: gridWidth }}>
                {monthLabels.map((month) => (
                  <Text key={`${month.label}-${month.weekIndex}`} style={{ color: weekdayColor, fontSize: 10, left: month.weekIndex * column, position: "absolute" }}>
                    {month.label}
                  </Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: GAP }}>
                {weeks.map((week) => (
                  <View key={week.cells[0]?.date ?? "week"} style={{ gap: GAP }}>
                    {week.cells.map((cell) => {
                      const blank = cell.count === null;
                      return (
                        <Pressable disabled={blank} key={cell.date} onPress={() => onSelect(cell.date)}>
                          <Animated.View
                            style={{
                              backgroundColor: blank ? "transparent" : palette[cell.level],
                              borderColor: cell.date === selectedDate ? weekdayColor : "transparent",
                              borderRadius: 2,
                              borderWidth: cell.date === selectedDate ? 1 : 0,
                              height: CELL,
                              transitionDuration: reducedMotion ? 0 : METRIC_TWEEN_MS,
                              transitionProperty: "backgroundColor",
                              transitionTimingFunction: "ease-out",
                              width: CELL,
                            }}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}
