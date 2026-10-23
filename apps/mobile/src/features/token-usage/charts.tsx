import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { AreaChart, BarChart, ContributionGraph } from "react-native-chart-kit/v2";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { AnimatedMetric } from "@/features/token-usage/animated-metric";
import {
  BAR_KIT_RIGHT,
  CHART_PLOT_BASE_LEFT,
  CHART_X_LABEL_BAND,
  CHART_X_LABEL_FONT,
  GROWTH_PLOT_LEFT,
  GROWTH_Y_LABEL_PAD,
  barBandStep,
  barContentWidth as barPlotContentWidth,
  barLabelAlign,
  barLabelX,
  barSliceWidth as barPlotSliceWidth,
  chartXFromGesture,
  growthContentWidth as growthPlotContentWidth,
  growthLabelAlign,
  growthPlotWidth,
  growthPointStep,
  growthPointX,
  growthSliceWidth as growthPlotSliceWidth,
  overlayPlotHeight,
  scrollEndOffset,
  visibleXLabelIndexes,
  windowedSliceFrame,
  xLabelFrame,
  xLabelWidth,
  type XLabelAlign,
} from "@/features/token-usage/chart-geometry";
import { popoverSeriesTint } from "@/features/token-usage/chart-popover-mark";
import {
  CHART_HOLD_MS,
  chartOpensOnTap,
  chartTipPersistsOnRelease,
  chartTipResetSignature,
  GROWTH_CHART_TIP,
  STACKED_CHART_TIP,
  type ChartTipOpen,
} from "@/features/token-usage/chart-press";
import {
  columnIndicatorColor,
  columnIndicatorHostX,
  columnIndicatorLine,
} from "@/features/token-usage/column-indicator";
import type { UsageDimension, HeatmapWeek } from "@/features/token-usage/model";
import { UsageModelIcon } from "@/features/token-usage/UsageModelIcon";
import { BotIcon } from "@/ui/icons/lucide-native";

const GRID = "rgba(113,113,122,0.35)";
const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
/** Extra outer size so the library's month and weekday labels fit inside `width`. */
const HEATMAP_LABEL_LANE = 72;
/** Library month lane plus seven cells. Extra height is an empty band under the grid. */
const MONTH_LABEL_HEIGHT = 18;
export const HEATMAP_PLOT_HEIGHT = MONTH_LABEL_HEIGHT + 7 * STEP - GAP;
const NO_INSET = { bottom: 0, left: 0, right: 0, top: 0 };
/** Matches the chart's left padding: 10 base + label width + 8 gap. Right base is 18. */
const Y_LABEL_WIDTH = 48;
const PLOT_X = 10 + Y_LABEL_WIDTH + 8;
const PLOT_RIGHT = 18;
const POINT_GAP = 32;
/** Fits compact values such as `-$999.9T`, so a finished roll does not resize the popover. */
const TIP_VALUE_SLOT = 100;
/** Horizontal spacing relative to the default gap. Pinch cannot pass these. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
/** Rebuild the chart only after the pinch moves this far. */
const ZOOM_STEP = 0.06;

function clampZoom(value: number) {
  "worklet";
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

type ZoomAnchor = { focalX: number; index: number };

function zoomOffset(
  anchor: ZoomAnchor,
  gap: number,
  axis: number,
  contentWidth: number,
  viewport: number,
) {
  const max = Math.max(0, contentWidth - viewport);
  const raw = anchor.index * gap - (anchor.focalX - axis);
  return Math.min(max, Math.max(0, raw));
}
/** On-screen move. Ease in and out so the border leaves one cell and settles into the next. */
const SELECTION_EASE = Easing.bezier(0.77, 0, 0.175, 1);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
/** Bar chart y-label width estimate. Matches chart-kit `measureBarChartText`. */
const BAR_BASE_LEFT = 10;
const BAR_LABEL_GAP = 8;
const BAR_LABEL_FONT = 11;
const BAR_LABEL_FACTOR = 0.56;
const BAR_SLOT = 36;
const WEEKDAY_LANE = 28;
const SERIES = ["s0", "s1", "s2", "s3", "s4", "s5"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type HeatValue = { count: number; date: string; key: string };

const BUBBLE = {
  backgroundColor: "rgba(24,24,27,0.92)",
  borderColor: "transparent",
  borderRadius: 10,
  labelColor: "rgba(255,255,255,0.72)",
  offset: 10,
  positionAnimationDuration: 0,
  textColor: "#ffffff",
} as const;

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

type HoldScroll = {
  axis: number;
  baseGap: number;
  onHold: (chartX: number) => void;
  onMove: (chartX: number) => void;
  onRelease: () => void;
  open?: ChartTipOpen;
  seriesKey: string;
};

/**
 * Native horizontal scroll (finger-follow and momentum). A still press locks
 * that scroll and reports the chart coordinate under the finger. A two-finger
 * pinch changes the horizontal spacing between `MIN_ZOOM` and `MAX_ZOOM`.
 *
 * The press is a gesture-handler pan, not a JS responder. Becoming the JS
 * responder makes UIScrollView toggle its own pan off and on, which drops the
 * rest of that touch and never delivers the next one.
 */
function useHoldScroll({
  axis,
  baseGap,
  onHold,
  onMove,
  onRelease,
  open = GROWTH_CHART_TIP,
  seriesKey,
}: HoldScroll) {
  const handlers = useRef({ onHold, onMove, onRelease });
  handlers.current = { onHold, onMove, onRelease };
  const hostRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const holdOffset = useRef(0);
  const holding = useRef(false);
  const userScrolled = useRef(false);
  const offsetListener = useRef<(offset: number) => void>(() => {});
  /** Scroll offset `placeEnd` asked for. Stale content-size events must not move the drawn window. */
  const pinnedOffset = useRef<number | null>(null);
  const zoomAnchor = useRef<ZoomAnchor | null>(null);
  const zoomingRef = useRef(false);
  const gestureToken = useRef(0);
  const closedToken = useRef(0);
  const seriesKeyRef = useRef(seriesKey);
  const [locked, setLocked] = useState(false);
  const [scale, setScale] = useState(1);
  const [zoomTick, setZoomTick] = useState(0);
  const [zooming, setZooming] = useState(false);
  if (seriesKeyRef.current !== seriesKey) {
    seriesKeyRef.current = seriesKey;
    zoomAnchor.current = null;
    gestureToken.current = 0;
    closedToken.current = 0;
    zoomingRef.current = false;
    if (scale !== 1) setScale(1);
    if (zooming) setZooming(false);
  }

  const offsetSv = useSharedValue(0);
  const axisSv = useSharedValue(axis);
  const baseGapSv = useSharedValue(baseGap);
  const scaleSv = useSharedValue(1);
  const pinchOriginSv = useSharedValue(1);
  const anchorSv = useSharedValue(0);
  const focalSv = useSharedValue(0);
  const pinchingSv = useSharedValue(false);
  const gestureIdSv = useSharedValue(0);
  useLayoutEffect(() => {
    axisSv.set(axis);
    baseGapSv.set(baseGap);
  }, [axis, axisSv, baseGap, baseGapSv]);
  useLayoutEffect(() => {
    scaleSv.set(1);
    pinchingSv.set(false);
  }, [pinchingSv, scaleSv, seriesKey]);

  const zoomApi = useRef({
    onBegin(_token: number) {},
    onCommit(_next: number, _anchor: number, _focal: number, _token: number) {},
    onEnd(_next: number, _anchor: number, _focal: number, _token: number) {},
  });
  const applyZoom = useCallback((next: number, anchor: number, focalX: number) => {
    zoomAnchor.current = { focalX, index: anchor };
    userScrolled.current = true;
    pinnedOffset.current = null;
    setScale((current) => (Math.abs(current - next) < 0.0001 ? current : next));
    setZoomTick((current) => current + 1);
  }, []);
  zoomApi.current = {
    onBegin(token) {
      gestureToken.current = token;
      closedToken.current = 0;
      pinnedOffset.current = null;
      userScrolled.current = true;
      zoomingRef.current = true;
      holding.current = false;
      setLocked(false);
      handlers.current.onRelease();
      scrollRef.current?.setNativeProps({ scrollEnabled: false });
      setZooming(true);
    },
    onCommit(next, anchor, focal, token) {
      if (token !== gestureToken.current || token === closedToken.current) return;
      applyZoom(clampZoom(next), anchor, focal);
    },
    onEnd(next, anchor, focal, token) {
      zoomingRef.current = false;
      scrollRef.current?.setNativeProps({ scrollEnabled: true });
      setZooming(false);
      if (token !== gestureToken.current) return;
      applyZoom(clampZoom(next), anchor, focal);
      closedToken.current = token;
    },
  };
  const beginZoom = useCallback((token: number) => zoomApi.current.onBegin(token), []);
  const commitZoom = useCallback((next: number, anchor: number, focal: number, token: number) => {
    zoomApi.current.onCommit(next, anchor, focal, token);
  }, []);
  const endZoom = useCallback((next: number, anchor: number, focal: number, token: number) => {
    zoomApi.current.onEnd(next, anchor, focal, token);
  }, []);

  const native = useMemo(() => Gesture.Native().disallowInterruption(false), []);
  const pan = useMemo(() => {
    const setLock = (next: boolean) => {
      setLocked((current) => (current === next ? current : next));
    };
    const unlock = () => {
      if (!holding.current) return;
      holding.current = false;
      scrollRef.current?.setNativeProps({ scrollEnabled: true });
      setLock(false);
      if (!chartTipPersistsOnRelease(open)) handlers.current.onRelease();
    };
    return Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .activateAfterLongPress(CHART_HOLD_MS)
      .cancelsTouchesInView(false)
      .shouldCancelWhenOutside(false)
      .simultaneousWithExternalGesture(native)
      .onStart((event) => {
        holding.current = true;
        holdOffset.current = offsetRef.current;
        scrollRef.current?.setNativeProps({ scrollEnabled: false });
        setLock(true);
        handlers.current.onHold(chartXFromGesture(event.x, holdOffset.current));
      })
      .onUpdate((event) => {
        if (!holding.current) return;
        handlers.current.onMove(chartXFromGesture(event.x, holdOffset.current));
      })
      .onFinalize(() => {
        unlock();
      });
  }, [native, open]);
  const tap = useMemo(() => {
    if (!chartOpensOnTap(open)) return null;
    return Gesture.Tap()
      .runOnJS(true)
      .maxDistance(12)
      .cancelsTouchesInView(false)
      .simultaneousWithExternalGesture(native)
      .onEnd((event) => {
        handlers.current.onHold(chartXFromGesture(event.x, offsetRef.current));
      });
  }, [native, open]);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .cancelsTouchesInView(false)
        .shouldCancelWhenOutside(false)
        .simultaneousWithExternalGesture(native)
        .onBegin(() => {
          gestureIdSv.set(gestureIdSv.get() + 1);
          pinchingSv.set(true);
          scheduleOnRN(beginZoom, gestureIdSv.get());
        })
        .onStart((event) => {
          const origin = scaleSv.get();
          pinchOriginSv.set(origin);
          const gap = baseGapSv.get() * origin;
          focalSv.set(event.focalX);
          anchorSv.set(gap > 0 ? (offsetSv.get() + event.focalX - axisSv.get()) / gap : 0);
        })
        .onUpdate((event) => {
          focalSv.set(event.focalX);
          scaleSv.set(clampZoom(pinchOriginSv.get() * event.scale));
        })
        .onFinalize(() => {
          const token = gestureIdSv.get();
          const next = scaleSv.get();
          const anchor = anchorSv.get();
          const focal = focalSv.get();
          pinchingSv.set(false);
          scheduleOnRN(endZoom, next, anchor, focal, token);
        }),
    [
      anchorSv,
      axisSv,
      baseGapSv,
      beginZoom,
      endZoom,
      focalSv,
      gestureIdSv,
      native,
      offsetSv,
      pinchOriginSv,
      pinchingSv,
      scaleSv,
    ],
  );
  const gesture = useMemo(
    () =>
      tap
        ? Gesture.Simultaneous(Gesture.Exclusive(pan, tap), pinch)
        : Gesture.Simultaneous(pan, pinch),
    [pan, pinch, tap],
  );
  useAnimatedReaction(
    () => Math.round(scaleSv.get() / ZOOM_STEP),
    (step, previous) => {
      if (!pinchingSv.get() || previous == null || step === previous) return;
      scheduleOnRN(commitZoom, scaleSv.get(), anchorSv.get(), focalSv.get(), gestureIdSv.get());
    },
    [anchorSv, commitZoom, focalSv, gestureIdSv, pinchingSv, scaleSv],
  );

  const scrollTo = useCallback(
    (x: number) => {
      offsetRef.current = x;
      offsetSv.set(x);
      scrollRef.current?.scrollTo({ animated: false, x });
    },
    [offsetSv],
  );
  const placeEnd = useCallback(
    (contentWidth: number, viewport: number) => {
      zoomAnchor.current = null;
      const x = scrollEndOffset(contentWidth, viewport);
      offsetRef.current = x;
      offsetSv.set(x);
      pinnedOffset.current = x;
      scrollRef.current?.scrollTo({ animated: false, x });
    },
    [offsetSv],
  );
  const noteDrag = useCallback(() => {
    if (holding.current || zoomingRef.current) return;
    userScrolled.current = true;
    pinnedOffset.current = null;
    zoomAnchor.current = null;
    if (chartTipPersistsOnRelease(open)) handlers.current.onRelease();
  }, [open]);
  const onScroll = useCallback(
    (x: number) => {
      if (holding.current) {
        if (Math.abs(x - holdOffset.current) > 0.5) {
          scrollRef.current?.scrollTo({ animated: false, x: holdOffset.current });
        }
        return;
      }
      if (zoomingRef.current) {
        if (Math.abs(x - offsetRef.current) > 0.5) {
          scrollRef.current?.scrollTo({ animated: false, x: offsetRef.current });
        }
        return;
      }
      if (pinnedOffset.current !== null && Math.abs(x - pinnedOffset.current) > 1) return;
      if (zoomAnchor.current && Math.abs(x - offsetRef.current) > 1) zoomAnchor.current = null;
      offsetRef.current = x;
      offsetSv.set(x);
      offsetListener.current(x);
    },
    [offsetSv],
  );

  return {
    gesture,
    hostRef,
    locked,
    native,
    noteDrag,
    offsetListener,
    offsetRef,
    onScroll,
    placeEnd,
    scale,
    scrollRef,
    scrollTo,
    userScrolled,
    zoomAnchor,
    zooming,
    zoomTick,
  };
}

function clampIndex(value: number, max: number) {
  return Math.min(max, Math.max(0, value));
}

function ChartViewport({
  axis,
  axisPlacement = "overlay",
  axisWidth,
  backgroundColor,
  children,
  contentWidth,
  height,
  overlay,
  scroll,
  width,
}: {
  axis: ReactNode;
  axisPlacement?: "overlay" | "start";
  axisWidth: number;
  backgroundColor: string;
  children: ReactNode;
  contentWidth: number;
  height: number;
  overlay?: ReactNode;
  scroll: ReturnType<typeof useHoldScroll>;
  width: number;
}) {
  const beside = axisPlacement === "start";
  const plotWidth = beside ? growthPlotWidth(width, axisWidth) : width;
  const content = Math.max(plotWidth, contentWidth);
  const axisColumn = (
    <View
      pointerEvents="none"
      style={
        beside
          ? { backgroundColor, height, overflow: "hidden", width: axisWidth }
          : {
              backgroundColor,
              height: overlayPlotHeight(height, CHART_X_LABEL_BAND),
              left: 0,
              overflow: "hidden",
              position: "absolute",
              top: 0,
              width: axisWidth,
            }
      }
    >
      {axis}
      {beside ? (
        <View
          style={{
            backgroundColor,
            bottom: 0,
            height: CHART_X_LABEL_BAND,
            left: 0,
            position: "absolute",
            right: 0,
          }}
        />
      ) : null}
    </View>
  );
  const plot = (
    <GestureDetector gesture={scroll.native}>
      <ScrollView
        automaticallyAdjustContentInsets={false}
        bounces={false}
        contentContainerStyle={{ width: content }}
        contentInset={NO_INSET}
        contentInsetAdjustmentBehavior="never"
        directionalLockEnabled
        horizontal
        nestedScrollEnabled
        onContentSizeChange={() => {
          if (scroll.zoomAnchor.current) {
            scroll.scrollTo(scroll.offsetRef.current);
            return;
          }
          if (scroll.userScrolled.current) return;
          scroll.placeEnd(contentWidth, plotWidth);
        }}
        onScroll={(event) => {
          scroll.onScroll(event.nativeEvent.contentOffset.x);
        }}
        onScrollBeginDrag={scroll.noteDrag}
        ref={scroll.scrollRef}
        scrollEnabled={!scroll.locked && !scroll.zooming}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={{ height, width: plotWidth }}
      >
        <View collapsable={false} pointerEvents="none" style={{ height, width: contentWidth }}>
          {children}
        </View>
      </ScrollView>
    </GestureDetector>
  );
  return (
    <GestureDetector gesture={scroll.gesture}>
      <View
        collapsable={false}
        ref={scroll.hostRef}
        style={beside ? { flexDirection: "row", height, width } : { height, width }}
      >
        {beside ? (
          <>
            {axisColumn}
            {plot}
          </>
        ) : (
          <>
            {plot}
            {axisColumn}
          </>
        )}
        {overlay ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {overlay}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function chartTheme(labelColor: string, series: string[]) {
  return {
    axis: GRID,
    background: "transparent",
    grid: GRID,
    mutedText: labelColor,
    plotBackground: "transparent",
    series,
    text: labelColor,
    tooltip: {
      background: BUBBLE.backgroundColor,
      border: "transparent",
      borderRadius: BUBBLE.borderRadius,
      labelFontSize: 12,
      mutedText: BUBBLE.labelColor,
      text: BUBBLE.textColor,
    },
  };
}

function ChartXLabels({
  alignAt,
  color,
  count,
  labels,
  xAt,
}: {
  alignAt: (index: number) => XLabelAlign;
  color: string;
  count: number;
  labels: string[];
  xAt: (index: number) => number;
}) {
  const indexes = visibleXLabelIndexes({
    alignAt,
    count,
    widthAt: (index) => xLabelWidth(labels[index] ?? ""),
    xAt,
  });
  return (
    <View pointerEvents="none" style={styles.xLabels}>
      {indexes.map((index) => {
        const text = labels[index] ?? "";
        const align = alignAt(index);
        const frame = xLabelFrame(xAt(index), align, xLabelWidth(text));
        return (
          <Text
            key={`${text}:${index}`}
            numberOfLines={1}
            style={[
              styles.xLabel,
              {
                color,
                left: frame.left,
                textAlign: align === "start" ? "left" : "center",
                width: frame.width,
              },
            ]}
          >
            {text}
          </Text>
        );
      })}
    </View>
  );
}

function growthContentWidth(plotWidth: number, count: number, gap: number) {
  return growthPlotContentWidth(plotWidth, count, gap, GROWTH_PLOT_LEFT, PLOT_RIGHT);
}

function growthSliceWidth(count: number, gap: number) {
  return growthPlotSliceWidth(count, gap, GROWTH_PLOT_LEFT, PLOT_RIGHT);
}

const SPAN_OVERSCAN = 24;
const SPAN_SLACK = 8;
type DrawnSpan = { end: number; start: number };

function trailingSpan(count: number, viewport: number, axis: number, gap: number): DrawnSpan {
  const lane = Math.max(gap, viewport - axis);
  const visible = Math.ceil(lane / gap) + 1;
  return { end: count, start: Math.max(0, count - visible - SPAN_OVERSCAN) };
}

function spanAround(
  offset: number,
  viewport: number,
  count: number,
  axis: number,
  gap: number,
): DrawnSpan {
  const lane = Math.max(gap, viewport - axis);
  const first = Math.floor(offset / gap);
  const last = Math.ceil((offset + lane) / gap);
  return {
    end: Math.min(count, last + SPAN_OVERSCAN + 1),
    start: Math.max(0, first - SPAN_OVERSCAN),
  };
}

function spanIsLoose(
  span: DrawnSpan,
  offset: number,
  viewport: number,
  count: number,
  axis: number,
  gap: number,
) {
  const lane = Math.max(gap, viewport - axis);
  const first = Math.floor(offset / gap);
  const last = Math.ceil((offset + lane) / gap);
  const leftOk = span.start === 0 || first >= span.start + SPAN_SLACK;
  const rightOk = span.end === count || last <= span.end - SPAN_SLACK;
  return leftOk && rightOk;
}

function useDrawnSpan(
  scroll: ReturnType<typeof useHoldScroll>,
  count: number,
  viewport: number,
  axis: number,
  gap: number,
  enabled: boolean,
) {
  const [span, setSpan] = useState<DrawnSpan>(() => trailingSpan(count, viewport, axis, gap));
  const spanRef = useRef(span);
  const keyRef = useRef({ count, enabled, gap });
  let visible = span;
  const gapChanged = Math.abs(keyRef.current.gap - gap) > 0.01;
  const recenter =
    scroll.zoomAnchor.current != null &&
    !spanIsLoose(span, scroll.offsetRef.current, viewport, count, axis, gap);
  if (keyRef.current.count !== count || keyRef.current.enabled !== enabled) {
    keyRef.current = { count, enabled, gap };
    visible = trailingSpan(count, viewport, axis, gap);
    spanRef.current = visible;
    setSpan(visible);
  } else if (gapChanged || recenter) {
    keyRef.current = { count, enabled, gap };
    const next = spanAround(scroll.offsetRef.current, viewport, count, axis, gap);
    if (next.start !== span.start || next.end !== span.end) {
      visible = next;
      spanRef.current = next;
      setSpan(next);
    } else {
      spanRef.current = span;
    }
  } else {
    spanRef.current = span;
  }
  useEffect(() => {
    if (!enabled) return undefined;
    scroll.offsetListener.current = (offset) => {
      if (spanIsLoose(spanRef.current, offset, viewport, count, axis, gap)) return;
      const next = spanAround(offset, viewport, count, axis, gap);
      if (next.start === spanRef.current.start && next.end === spanRef.current.end) return;
      spanRef.current = next;
      setSpan(next);
    };
    return () => {
      scroll.offsetListener.current = () => {};
    };
  }, [axis, count, enabled, gap, scroll.offsetListener, viewport]);
  if (!enabled) return { end: count, start: 0 };
  return visible;
}

function pointIndexAt(
  chartX: number,
  contentWidth: number,
  count: number,
  plotLeft: number = CHART_PLOT_BASE_LEFT,
) {
  if (count <= 1) return 0;
  const plotWidth = Math.max(1, contentWidth - plotLeft - PLOT_RIGHT);
  const ratio = (chartX - plotLeft) / plotWidth;
  return clampIndex(Math.round(ratio * (count - 1)), count - 1);
}

export function UsageGrowthChart({
  backgroundColor,
  color,
  formatValue,
  height,
  labels,
  labelColor,
  resetKey,
  values,
  width,
}: {
  backgroundColor: string;
  color: string;
  formatValue: (value: number) => string;
  height: number;
  labels: string[];
  labelColor: string;
  resetKey?: string | null;
  values: number[];
  width: number;
}) {
  const points = useMemo(
    () => labels.map((label, index) => ({ label, value: values[index] ?? 0 })),
    [labels, values],
  );
  const count = points.length;
  const peak = useMemo(() => values.reduce((max, value) => Math.max(max, value), 0), [values]);
  const seriesKey = chartTipResetSignature({ labels, resetKey, values });
  const contentWidthRef = useRef(width);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [selected, setSelected] = useState<number | null>(null);
  const [tip, setTip] = useState<PointTip | null>(null);
  const tipRef = useRef<PointTip | null>(null);
  const holdGen = useRef(0);
  const selectRef = useRef<(chartX: number) => void>(() => {});
  const plotWidth = growthPlotWidth(width, PLOT_X);
  const scroll = useHoldScroll({
    axis: PLOT_X + GROWTH_PLOT_LEFT,
    baseGap: POINT_GAP,
    onHold: (chartX) => selectRef.current(chartX - PLOT_X),
    onMove: (chartX) => selectRef.current(chartX - PLOT_X),
    onRelease: () => {
      holdGen.current += 1;
      tipRef.current = null;
      setTip(null);
      setSelected(null);
    },
    seriesKey,
  });
  const gap = POINT_GAP * scroll.scale;
  const contentWidth = growthContentWidth(plotWidth, count, gap);
  const pointStep = growthPointStep(count, contentWidth);
  contentWidthRef.current = contentWidth;
  const publishTip = useCallback((next: PointTip) => {
    const current = tipRef.current;
    if (
      current &&
      current.index === next.index &&
      current.label === next.label &&
      current.value === next.value &&
      Math.abs(current.x - next.x) < 0.5 &&
      Math.abs(current.y - next.y) < 0.5
    )
      return;
    tipRef.current = next;
    setTip(next);
  }, []);
  const selectAt = useCallback(
    (chartX: number) => {
      const series = pointsRef.current;
      const next = pointIndexAt(chartX, contentWidthRef.current, series.length, GROWTH_PLOT_LEFT);
      const point = series[next];
      if (!point) return;
      setSelected((current) => (current === next ? current : next));
      const previous = tipRef.current;
      if (previous?.index !== next) holdGen.current += 1;
      publishTip({
        index: next,
        label: point.label,
        value: point.value,
        x: PLOT_X + growthPointX(next, GROWTH_PLOT_LEFT, pointStep) - scroll.offsetRef.current,
        y: previous?.y ?? 36,
      });
    },
    [pointStep, publishTip, scroll.offsetRef],
  );
  selectRef.current = selectAt;
  const anchor = scroll.zoomAnchor.current;
  if (anchor) {
    scroll.offsetRef.current = zoomOffset(
      anchor,
      gap,
      PLOT_X + GROWTH_PLOT_LEFT,
      contentWidth,
      plotWidth,
    );
  }
  const windowed = contentWidth > plotWidth + 1;
  const span = useDrawnSpan(scroll, count, plotWidth, 0, gap, windowed);
  useLayoutEffect(() => {
    scroll.userScrolled.current = false;
    holdGen.current += 1;
    tipRef.current = null;
    setTip(null);
    setSelected(null);
    scroll.placeEnd(contentWidthRef.current, plotWidth);
  }, [plotWidth, scroll.placeEnd, scroll.userScrolled, seriesKey]);
  useLayoutEffect(() => {
    if (!scroll.zoomAnchor.current) return;
    scroll.scrollTo(scroll.offsetRef.current);
  }, [gap, scroll.scrollTo, scroll.zoomAnchor, scroll.zoomTick]);
  if (count === 0) return null;
  const plotHeight = overlayPlotHeight(height);
  const domain = { max: Math.max(peak, 1), min: 0, nice: true } as const;
  const theme = chartTheme(labelColor, [color]);
  const drawn = windowed ? points.slice(span.start, span.end) : points;
  const drawnWidth = windowed ? growthSliceWidth(drawn.length, gap) : contentWidth;
  const localSelected =
    selected != null && selected >= span.start && selected < span.start + drawn.length
      ? selected - span.start
      : undefined;
  const plot = (
    <AreaChart
      accessibilityLabel="Usage over time"
      activeDot={{ fill: "background", radius: 4, stroke: "series" }}
      areaFill={{ fromOpacity: 0.22, toOpacity: 0.02 }}
      crosshair={{ color, strokeDasharray: [3, 4], strokeWidth: 1 }}
      curve="monotone"
      data={drawn}
      decimation={false}
      formatYLabel={() => ""}
      height={plotHeight}
      interaction="none"
      labelStrategy="hide"
      legend={false}
      renderActiveDot={({ dataIndex, point }) => {
        const index = span.start + dataIndex;
        const chosen = points[index];
        if (chosen) {
          const generation = holdGen.current;
          const next = {
            index,
            label: chosen.label,
            value: chosen.value,
            x: PLOT_X + span.start * gap + point.x - scroll.offsetRef.current,
            y: point.y,
          };
          queueMicrotask(() => {
            if (holdGen.current !== generation) return;
            publishTip(next);
          });
        }
        return (
          <Circle
            cx={point.x}
            cy={point.y}
            fill="transparent"
            r={4}
            stroke={color}
            strokeWidth={2.5}
          />
        );
      }}
      selectedIndex={localSelected}
      series={[{ color, label: "Usage", yKey: "value" }]}
      showDots={false}
      showVerticalGridLines={false}
      testID="token-usage-growth"
      theme={theme}
      tooltip={false}
      width={drawnWidth}
      xKey="label"
      yAxisLabelWidth={GROWTH_Y_LABEL_PAD}
      yDomain={domain}
    />
  );
  return (
    <ChartViewport
      axis={
        <AreaChart
          areaFill={{ fromOpacity: 0, toOpacity: 0 }}
          data={[
            { label: points[0]?.label ?? "", value: 0 },
            { label: points[count - 1]?.label ?? "", value: peak },
          ]}
          formatYLabel={formatValue}
          height={plotHeight}
          interaction="none"
          labelStrategy="hide"
          legend={false}
          series={[{ color, label: "Usage", yKey: "value" }]}
          showDots={false}
          showHorizontalGridLines={false}
          showVerticalGridLines={false}
          theme={theme}
          tooltip={false}
          width={PLOT_X}
          xKey="label"
          yAxisLabelWidth={Y_LABEL_WIDTH}
          yDomain={domain}
        />
      }
      axisPlacement="start"
      axisWidth={PLOT_X}
      backgroundColor={backgroundColor}
      contentWidth={contentWidth}
      height={height}
      overlay={tip ? <PointTipView chartWidth={width} formatValue={formatValue} tip={tip} /> : null}
      scroll={scroll}
      width={width}
    >
      {windowed ? (
        <View
          style={{
            height: plotHeight,
            ...windowedSliceFrame(span.start, gap, drawnWidth),
            overflow: "visible",
            position: "absolute",
          }}
        >
          {plot}
        </View>
      ) : (
        <View style={{ height: plotHeight, width: contentWidth }}>{plot}</View>
      )}
      <ChartXLabels
        alignAt={growthLabelAlign}
        color={labelColor}
        count={count}
        labels={labels}
        xAt={(index) => growthPointX(index, GROWTH_PLOT_LEFT, pointStep)}
      />
    </ChartViewport>
  );
}

function tickStep(start: number, stop: number, count: number) {
  const raw = Math.abs(stop - start) / Math.max(1, count);
  if (!Number.isFinite(raw) || raw === 0) return 0;
  const power = Math.floor(Math.log10(raw));
  const error = raw / 10 ** power;
  const factor =
    error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.sqrt(2) ? 2 : 1;
  return factor * 10 ** power;
}

function barAxisEstimate(format: (value: number) => string, peak: number) {
  const max = Math.max(peak, 1);
  const niceStep = tickStep(0, max, 5);
  const niceMax = niceStep === 0 ? max : Math.ceil(max / niceStep) * niceStep;
  const step = tickStep(0, niceMax, 5);
  let widest = format(0).length;
  if (step > 0) {
    const epsilon = step * 1e-10;
    for (let value = 0; value <= niceMax + epsilon; value += step) {
      widest = Math.max(widest, format(Number(value.toPrecision(12))).length);
    }
  }
  return BAR_BASE_LEFT + widest * BAR_LABEL_FONT * BAR_LABEL_FACTOR + BAR_LABEL_GAP;
}

function barContentWidth(plotWidth: number, count: number, slot: number) {
  return barPlotContentWidth(plotWidth, count, slot, CHART_PLOT_BASE_LEFT, BAR_KIT_RIGHT);
}

function barSliceWidth(count: number, slot: number) {
  return barPlotSliceWidth(count, slot, CHART_PLOT_BASE_LEFT, BAR_KIT_RIGHT);
}

export function UsageStackedChart({
  backgroundColor,
  colors,
  dimension,
  formatValue,
  height,
  ids,
  isDark,
  labels,
  labelColor,
  names,
  providers,
  resetKey,
  series,
  width,
}: {
  backgroundColor: string;
  colors: string[];
  dimension: UsageDimension;
  formatValue: (value: number) => string;
  height: number;
  ids: string[];
  isDark: boolean;
  labels: string[];
  labelColor: string;
  names: string[];
  providers?: ReadonlyMap<string, string>;
  resetKey?: string | null;
  series: number[][];
  width: number;
}) {
  const segmentCount = Math.min(SERIES.length, ids.length, series[0]?.length ?? 0);
  const paint = colors.slice(0, segmentCount);
  const rows = useMemo(
    () =>
      labels.map((label, index) => {
        const row = { label, s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
        for (let segment = 0; segment < segmentCount; segment += 1)
          row[SERIES[segment]!] = series[index]?.[segment] ?? 0;
        return row;
      }),
    [labels, segmentCount, series],
  );
  const count = rows.length;
  const peak = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      let sum = 0;
      for (let index = 0; index < segmentCount; index += 1) sum += row[SERIES[index]!] ?? 0;
      if (sum > max) max = sum;
    }
    return max;
  }, [rows, segmentCount]);
  const estimate = useMemo(() => barAxisEstimate(formatValue, peak), [formatValue, peak]);
  const axisWidth = estimate;
  const seriesKey = chartTipResetSignature({
    labels,
    resetKey,
    values: series.flat(),
  });
  const contentWidthRef = useRef(width);
  const frames = useRef(new Map<number, ColumnFrame>());
  const frameKeyRef = useRef("");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [tip, setTip] = useState<ColumnTip | null>(null);
  const selectRef = useRef<(chartX: number) => void>(() => {});
  const plotWidth = growthPlotWidth(width, axisWidth);
  const scroll = useHoldScroll({
    axis: axisWidth + CHART_PLOT_BASE_LEFT,
    baseGap: BAR_SLOT,
    onHold: (chartX) => selectRef.current(chartX - axisWidth),
    onMove: (chartX) => selectRef.current(chartX - axisWidth),
    onRelease: () => setTip(null),
    open: STACKED_CHART_TIP,
    seriesKey,
  });
  const slot = BAR_SLOT * scroll.scale;
  const contentWidth = barContentWidth(plotWidth, count, slot);
  const bandStep = barBandStep(count, contentWidth);
  contentWidthRef.current = contentWidth;
  const anchor = scroll.zoomAnchor.current;
  if (anchor) {
    scroll.offsetRef.current = zoomOffset(
      anchor,
      slot,
      axisWidth + CHART_PLOT_BASE_LEFT,
      contentWidth,
      plotWidth,
    );
  }
  const windowed = contentWidth > plotWidth + 1;
  const span = useDrawnSpan(scroll, count, plotWidth, 0, slot, windowed);
  const selectAt = useCallback(
    (chartX: number) => {
      const frame = columnAt(chartX, frames.current);
      const row = frame ? rowsRef.current[frame.index] : undefined;
      if (!frame || !row) return;
      const nextRows: ColumnTipRow[] = [];
      for (let index = 0; index < segmentCount; index += 1) {
        const amount = row[SERIES[index]!] ?? 0;
        if (amount <= 0) continue;
        const id = ids[index] || String(index);
        nextRows.push({
          amount,
          color: paint[index] ?? labelColor,
          icon: seriesMark(dimension, id, paint[index] ?? labelColor, providers),
          key: id,
          name: names[index] ?? id,
        });
      }
      const next = {
        index: frame.index,
        rows: nextRows,
        title: row.label,
        x: columnIndicatorHostX({
          axisWidth,
          offset: scroll.offsetRef.current,
          width: frame.width,
          x: frame.x,
        }),
        y: frame.y,
      };
      setTip((current) => (sameColumnTip(current, next) ? current : next));
    },
    [
      axisWidth,
      dimension,
      ids,
      labelColor,
      names,
      paint,
      providers,
      scroll.offsetRef,
      segmentCount,
    ],
  );
  selectRef.current = selectAt;
  useLayoutEffect(() => {
    scroll.userScrolled.current = false;
    setTip(null);
    scroll.placeEnd(contentWidthRef.current, plotWidth);
  }, [plotWidth, scroll.placeEnd, scroll.userScrolled, seriesKey]);
  useLayoutEffect(() => {
    if (!scroll.zoomAnchor.current) return;
    scroll.scrollTo(scroll.offsetRef.current);
  }, [scroll.scrollTo, scroll.zoomAnchor, scroll.zoomTick, slot]);
  const frameKey = `${span.start}:${span.end}:${count}:${slot}`;
  if (frameKeyRef.current !== frameKey) {
    frameKeyRef.current = frameKey;
    frames.current = new Map();
  }
  if (segmentCount === 0 || count === 0) return null;
  const domain = { max: Math.max(peak, 1), min: 0, nice: true } as const;
  const theme = chartTheme(labelColor, paint);
  const drawn = windowed ? rows.slice(span.start, span.end) : rows;
  const drawnWidth = windowed ? barSliceWidth(drawn.length, slot) : contentWidth;
  const axisRows = [
    { label: rows[0]?.label ?? "", s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
    { label: rows[count - 1]?.label ?? "", s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
  ];
  const barSeries = SERIES.slice(0, segmentCount).map((yKey, index) => ({
    color: paint[index],
    key: ids[index] || String(index),
    label: names[index] ?? ids[index] ?? "",
    yKey,
  }));
  const bars = (
    <BarChart
      accessibilityLabel={dimension === "model" ? "Usage by model" : "Usage by agent"}
      barRadius={4}
      data={drawn}
      formatYLabel={() => ""}
      height={height}
      interaction="none"
      legend={false}
      mode="stacked"
      renderBar={({ bar, fill, radius }) => {
        const index = span.start + bar.dataIndex;
        const current = frames.current.get(index);
        frames.current.set(index, {
          index,
          width: bar.width,
          x: bar.x + span.start * slot,
          y: current ? Math.min(current.y, bar.y) : bar.y,
        });
        return (
          <Rect fill={fill} height={bar.height} rx={radius} width={bar.width} x={bar.x} y={bar.y} />
        );
      }}
      series={barSeries}
      showXAxisLabels={false}
      showYAxisLabels={false}
      testID="token-usage-stacked"
      theme={theme}
      tooltip={false}
      width={drawnWidth}
      xKey="label"
      yDomain={domain}
    />
  );
  return (
    <ChartViewport
      axis={
        <BarChart
          data={axisRows}
          formatYLabel={formatValue}
          height={height}
          interaction="none"
          legend={false}
          mode="stacked"
          series={barSeries}
          showHorizontalGridLines={false}
          showXAxisLabels={false}
          theme={theme}
          tooltip={false}
          width={axisWidth}
          xKey="label"
          yDomain={domain}
        />
      }
      axisPlacement="start"
      axisWidth={axisWidth}
      backgroundColor={backgroundColor}
      contentWidth={contentWidth}
      height={height}
      overlay={
        tip ? (
          <ColumnTipView
            chartHeight={height}
            chartWidth={width}
            formatValue={formatValue}
            isDark={isDark}
            tip={tip}
          />
        ) : null
      }
      scroll={scroll}
      width={width}
    >
      {windowed ? (
        <View
          style={{
            height,
            ...windowedSliceFrame(span.start, slot, drawnWidth),
            overflow: "visible",
            position: "absolute",
          }}
        >
          {bars}
        </View>
      ) : (
        bars
      )}
      <ChartXLabels
        alignAt={barLabelAlign}
        color={labelColor}
        count={count}
        labels={labels}
        xAt={(index) => barLabelX(index, CHART_PLOT_BASE_LEFT, bandStep)}
      />
    </ChartViewport>
  );
}

type ColumnFrame = { index: number; width: number; x: number; y: number };
type ColumnTipRow = { amount: number; color: string; icon: ReactNode; key: string; name: string };
type ColumnTip = { index: number; rows: ColumnTipRow[]; title: string; x: number; y: number };

function columnAt(x: number, frames: Map<number, ColumnFrame>) {
  let nearest: ColumnFrame | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const frame of frames.values()) {
    if (x >= frame.x && x <= frame.x + frame.width) return frame;
    const distance = Math.abs(x - (frame.x + frame.width / 2));
    if (distance < nearestDistance) {
      nearest = frame;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function sameColumnTip(current: ColumnTip | null, next: ColumnTip) {
  if (!current || current.index !== next.index || current.rows.length !== next.rows.length)
    return false;
  return current.rows.every(
    (row, index) => row.key === next.rows[index]?.key && row.amount === next.rows[index]?.amount,
  );
}

function seriesMark(
  dimension: UsageDimension,
  id: string,
  color: string,
  providers?: ReadonlyMap<string, string>,
) {
  if (dimension === "model")
    return <UsageModelIcon color={color} modelId={id} providerId={providers?.get(id)} size={12} />;
  if (id === "other") return <BotIcon color={color} size={12} />;
  return <MobileAgentIcon agentId={id} onDark size={12} tintColor={popoverSeriesTint(color)} />;
}

type PointTip = { index: number; label: string; value: number; x: number; y: number };

function PointTipView({
  chartWidth,
  formatValue,
  tip,
}: {
  chartWidth: number;
  formatValue: (value: number) => string;
  tip: PointTip;
}) {
  const [size, setSize] = useState({ height: 0, width: 0 });
  const left = Math.min(
    Math.max(8, tip.x - size.width / 2),
    Math.max(8, chartWidth - size.width - 8),
  );
  const top = Math.max(4, tip.y - size.height - 12);
  return (
    <View
      onLayout={(event) => {
        const next = {
          height: event.nativeEvent.layout.height,
          width: event.nativeEvent.layout.width,
        };
        if (next.height <= 0 || next.width <= 0) return;
        setSize((current) =>
          current.width === next.width && current.height === next.height ? current : next,
        );
      }}
      pointerEvents="none"
      style={[styles.tip, { left, opacity: size.height > 0 ? 1 : 0, top }]}
    >
      <Text style={styles.tipTitle}>{tip.label}</Text>
      <AnimatedMetric
        format={formatValue}
        slotWidth={TIP_VALUE_SLOT}
        style={styles.pointValue}
        value={tip.value}
      />
    </View>
  );
}

function ColumnTipView({
  chartHeight,
  chartWidth,
  formatValue,
  isDark,
  tip,
}: {
  chartHeight: number;
  chartWidth: number;
  formatValue: (value: number) => string;
  isDark: boolean;
  tip: ColumnTip;
}) {
  const [size, setSize] = useState({ height: 0, width: 0 });
  const left = Math.min(
    Math.max(8, tip.x - size.width / 2),
    Math.max(8, chartWidth - size.width - 8),
  );
  const top = Math.max(4, tip.y - size.height - 12);
  const indicator = columnIndicatorLine({ height: chartHeight, x: tip.x });
  return (
    <>
      <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
        <Line
          stroke={columnIndicatorColor(isDark)}
          strokeWidth={1}
          x1={indicator.x1}
          x2={indicator.x2}
          y1={indicator.y1}
          y2={indicator.y2}
        />
      </Svg>
      <View
        onLayout={(event) => {
          const next = {
            height: event.nativeEvent.layout.height,
            width: event.nativeEvent.layout.width,
          };
          if (next.height <= 0 || next.width <= 0) return;
          setSize((current) =>
            current.width === next.width && current.height === next.height ? current : next,
          );
        }}
        pointerEvents="none"
        style={[styles.tip, { left, opacity: size.height > 0 ? 1 : 0, top }]}
      >
        <Text style={styles.tipTitle}>{tip.title}</Text>
        {tip.rows.map((row) => (
          <View key={row.key} style={styles.tipRow}>
            {row.icon}
            <Text numberOfLines={1} style={styles.tipName}>
              {row.name}
            </Text>
            <AnimatedMetric
              format={formatValue}
              pinEnd
              slotWidth={TIP_VALUE_SLOT}
              style={styles.tipValue}
              value={row.amount}
            />
          </View>
        ))}
      </View>
    </>
  );
}

function localDateKey(date: Date) {
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

function levelColor(count: number, max: number, palette: readonly string[]) {
  if (max <= 0 || count <= 0) return palette[0] ?? "transparent";
  const ratio = count / max;
  const level = ratio < 0.2 ? 1 : ratio < 0.45 ? 2 : ratio < 0.7 ? 3 : 4;
  return palette[level] ?? palette[palette.length - 1] ?? "transparent";
}

type SelectionPoint = { x: number; y: number };

function selectionCorner(fromX: number, fromY: number, toX: number, toY: number) {
  "worklet";
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.abs(dx) + Math.abs(dy);
  // Longer axis first. A tie slides across the weeks, then up or down the column.
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  return {
    cornerX: horizontalFirst ? toX : fromX,
    cornerY: horizontalFirst ? fromY : toY,
    distance,
    split: distance === 0 ? 1 : (horizontalFirst ? Math.abs(dx) : Math.abs(dy)) / distance,
  };
}

function pointOnSelectionPath(
  t: number,
  fromX: number,
  fromY: number,
  cornerX: number,
  cornerY: number,
  toX: number,
  toY: number,
  split: number,
): SelectionPoint {
  "worklet";
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= split || split >= 1) {
    const u = split <= 0 ? 1 : clamped / split;
    return {
      x: fromX + (cornerX - fromX) * u,
      y: fromY + (cornerY - fromY) * u,
    };
  }
  const u = (clamped - split) / (1 - split);
  return {
    x: cornerX + (toX - cornerX) * u,
    y: cornerY + (toY - cornerY) * u,
  };
}

function selectionDuration(distance: number) {
  return Math.round(Math.min(280, Math.max(200, 180 + distance * 0.25)));
}

function HeatmapActiveBorder({
  color,
  weekIndex,
  weekdayIndex,
}: {
  color: string;
  weekIndex: number;
  weekdayIndex: number;
}) {
  const reduced = useReducedMotion();
  const startX = WEEKDAY_LANE + weekIndex * STEP;
  const startY = MONTH_LABEL_HEIGHT + weekdayIndex * STEP;
  const progress = useSharedValue(1);
  const originX = useSharedValue(startX);
  const originY = useSharedValue(startY);
  const turnX = useSharedValue(startX);
  const turnY = useSharedValue(startY);
  const destX = useSharedValue(startX);
  const destY = useSharedValue(startY);
  const split = useSharedValue(1);
  const animatedProps = useAnimatedProps(() => {
    const point = pointOnSelectionPath(
      progress.get(),
      originX.get(),
      originY.get(),
      turnX.get(),
      turnY.get(),
      destX.get(),
      destY.get(),
      split.get(),
    );
    return { x: point.x, y: point.y };
  });
  useEffect(() => {
    const nextX = WEEKDAY_LANE + weekIndex * STEP;
    const nextY = MONTH_LABEL_HEIGHT + weekdayIndex * STEP;
    cancelAnimation(progress);
    const current = pointOnSelectionPath(
      progress.get(),
      originX.get(),
      originY.get(),
      turnX.get(),
      turnY.get(),
      destX.get(),
      destY.get(),
      split.get(),
    );
    const settled = Math.abs(current.x - nextX) < 0.5 && Math.abs(current.y - nextY) < 0.5;
    if (reduced || settled) {
      originX.set(nextX);
      originY.set(nextY);
      turnX.set(nextX);
      turnY.set(nextY);
      destX.set(nextX);
      destY.set(nextY);
      split.set(1);
      progress.set(1);
      return;
    }
    const corner = selectionCorner(current.x, current.y, nextX, nextY);
    originX.set(current.x);
    originY.set(current.y);
    turnX.set(corner.cornerX);
    turnY.set(corner.cornerY);
    destX.set(nextX);
    destY.set(nextY);
    split.set(corner.split);
    progress.set(0);
    progress.set(
      withTiming(1, { duration: selectionDuration(corner.distance), easing: SELECTION_EASE }),
    );
  }, [
    destX,
    destY,
    originX,
    originY,
    progress,
    reduced,
    split,
    turnX,
    turnY,
    weekIndex,
    weekdayIndex,
  ]);
  return (
    <AnimatedRect
      animatedProps={animatedProps}
      fill="none"
      height={CELL}
      rx={3}
      ry={3}
      stroke={color}
      strokeWidth={1.5}
      width={CELL}
    />
  );
}

function cellSlot(dateKey: string) {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const index = Math.round((date.getTime() - start.getTime()) / 86400000);
  if (index < 0) return null;
  return { weekIndex: Math.floor(index / 7), weekdayIndex: index % 7 };
}

function weekdayLabel(dayIndex: number) {
  const name = WEEKDAYS[dayIndex] ?? "";
  return name === "Mon" || name === "Wed" || name === "Fri" ? name : "";
}

export function UsageHeatmap({
  onSelect,
  palette,
  selectedDate,
  selectionColor,
  weekdayColor,
  weeks,
}: {
  onSelect: (date: string) => void;
  palette: readonly string[];
  selectedDate: string | null;
  selectionColor: string;
  weekdayColor: string;
  weeks: HeatmapWeek[];
}) {
  const scrollRef = useRef<ScrollView>(null);
  const userScrolled = useRef(false);
  const [plotWidth, setPlotWidth] = useState(0);
  const chartWidth = Math.max(STEP + HEATMAP_LABEL_LANE, weeks.length * STEP + HEATMAP_LABEL_LANE);
  const today = localDateKey(new Date());
  const latestIndex = useMemo(() => latestInYearWeek(weeks, today), [today, weeks]);
  const days = useMemo(
    () => weeks.flatMap((week) => week.cells).filter((cell) => cell.count !== null),
    [weeks],
  );
  const values = useMemo<HeatValue[]>(
    () => days.map((cell) => ({ count: cell.count ?? 0, date: cell.date, key: cell.date })),
    [days],
  );
  const end = days[days.length - 1];
  const placeLatest = useCallback(() => {
    if (userScrolled.current || latestIndex < 0 || plotWidth <= 0 || chartWidth <= plotWidth + 1)
      return;
    const maxOffset = Math.max(0, chartWidth - plotWidth);
    const latestRight = HEATMAP_LABEL_LANE + (latestIndex + 1) * CELL + latestIndex * GAP;
    const offset = Math.min(maxOffset, Math.max(0, latestRight - plotWidth * 0.75));
    scrollRef.current?.scrollTo({ animated: false, x: offset });
  }, [chartWidth, latestIndex, plotWidth]);
  useEffect(() => {
    userScrolled.current = false;
    const frame = requestAnimationFrame(placeLatest);
    return () => cancelAnimationFrame(frame);
  }, [placeLatest]);
  const slot = selectedDate ? cellSlot(selectedDate) : null;
  if (!end || values.length === 0) {
    return <View style={styles.heatmapPlot} />;
  }
  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setPlotWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
      }}
      style={styles.heatmapPlot}
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
          style={{ height: HEATMAP_PLOT_HEIGHT, width: plotWidth }}
        >
          <View style={{ height: HEATMAP_PLOT_HEIGHT, width: chartWidth }}>
            <ContributionGraph
              accessibilityLabel="Usage by day"
              activeCell={false}
              cellSize={CELL}
              colorForValue={({ cell, valueMax }) => {
                if (cell.outOfRange) return "transparent";
                return levelColor(cell.value ?? 0, valueMax, palette);
              }}
              colors={[...palette.slice(1)]}
              emptyColor={palette[0]}
              endDate={end.date}
              getMonthLabel={(_month, date) => date.toLocaleDateString("en-US", { month: "short" })}
              getWeekdayLabel={weekdayLabel}
              gutterSize={GAP}
              height={HEATMAP_PLOT_HEIGHT}
              interaction={{ mode: "tap" }}
              numDays={values.length}
              onDayPress={(event) => {
                const key =
                  typeof event.raw?.key === "string" ? event.raw.key : localDateKey(event.date);
                onSelect(key);
              }}
              showMonthLabels
              showOutOfRangeDays
              showWeekdayLabels
              testID="token-usage-heatmap"
              theme={{
                background: "transparent",
                mutedText: weekdayColor,
                plotBackground: "transparent",
                text: weekdayColor,
              }}
              values={values}
              weekStartsOn={0}
              width={chartWidth}
            />
            {slot ? (
              <Svg
                height={HEATMAP_PLOT_HEIGHT}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                width={chartWidth}
              >
                <HeatmapActiveBorder
                  color={selectionColor}
                  weekdayIndex={slot.weekdayIndex}
                  weekIndex={slot.weekIndex}
                />
              </Svg>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heatmapPlot: {
    alignSelf: "stretch",
    minHeight: HEATMAP_PLOT_HEIGHT,
    minWidth: 0,
    overflow: "hidden",
    width: "100%",
  },
  xLabel: { fontSize: CHART_X_LABEL_FONT, position: "absolute", top: 6 },
  xLabels: {
    bottom: 0,
    height: CHART_X_LABEL_BAND,
    left: 0,
    position: "absolute",
    right: 0,
  },
  tip: {
    backgroundColor: BUBBLE.backgroundColor,
    borderRadius: BUBBLE.borderRadius,
    gap: 4,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "absolute",
    zIndex: 2,
  },
  tipName: { color: "#fff", flexShrink: 1, fontSize: 12 },
  tipRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  pointValue: { color: "#fff", fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "600" },
  tipTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },
  tipValue: { color: "#fff", fontSize: 12, fontVariant: ["tabular-nums"] },
});
