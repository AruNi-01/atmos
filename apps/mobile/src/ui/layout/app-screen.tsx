import type { PropsWithChildren, ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUiStore } from "@/stores/ui-store";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import { useHomeTabBarInset } from "@/ui/layout/home-tab-bar-inset";
import {
  sessionListDistanceFromEnd,
  sessionListShouldRequestNextPage,
  type SessionListScrollMetrics,
} from "@/ui/layout/scroll-end";
import { GlassPanel } from "@/ui/primitives/glass-panel";

type AppScreenProps = PropsWithChildren<{
  /** Grow content to the viewport so children can vertically center (e.g. disconnected home). */
  contentFlex?: boolean;
  footer?: ReactNode;
  /**
   * When the list is shorter than the screen and this is true, keep loading
   * pages. A filtered state can have a large total and only a few rows in the
   * first global page, so the user cannot scroll to the end yet.
   */
  fillWhenShort?: boolean;
  /** Called once each time the user scrolls to the bottom. */
  onEndReached?: () => void;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  surface?: "screen" | "sheet";
}>;

/** Fallback while the sticky footer has not laid out yet (two large CTAs + safe area). */
const FOOTER_HEIGHT_FALLBACK = 180;

export function AppScreen({
  children,
  contentFlex = false,
  fillWhenShort = false,
  footer,
  onEndReached,
  onRefresh,
  refreshing = false,
  surface = "screen",
}: AppScreenProps) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const tabBarInset = useHomeTabBarInset();
  const disconnectedReason = useUiStore((state) => state.disconnectedReason);
  // Prefer theme.colors for surfaces so dark mode stays correct even when
  // NativeWind CSS variables lag behind Appearance / form-sheet chrome.
  const surfaceColor =
    surface === "sheet" ? theme.colors.sheetBackground : theme.colors.background;
  const footerPaddingBottom = Math.max(insets.bottom, spacing.screenFooterBottom);
  const [footerHeight, setFooterHeight] = useState(0);

  const handleFooterLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setFooterHeight((current) => (current === nextHeight ? current : nextHeight));
  };

  // Sticky footer paints as a sibling (fragment) so form sheets keep a non-zero
  // ScrollView height. Spacer (not contentContainerStyle alone) reserves room so
  // NativeWind className merge cannot drop the bottom inset under the dock.
  const footerClearance = Math.max(footerHeight, FOOTER_HEIGHT_FALLBACK) + spacing.sectionGap;

  const metricsRef = useRef<SessionListScrollMetrics>({
    contentHeight: 0,
    insetBottom: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  const armed = useRef(true);
  const fillWhenShortRef = useRef(fillWhenShort);
  fillWhenShortRef.current = fillWhenShort;
  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;

  const requestNextPage = () => {
    if (!onEndReachedRef.current) return;
    const metrics = metricsRef.current;
    const decision = sessionListShouldRequestNextPage({
      armed: armed.current,
      contentHeight: metrics.contentHeight,
      distanceFromEnd: sessionListDistanceFromEnd(metrics),
      fillWhenShort: fillWhenShortRef.current,
      viewportHeight: metrics.viewportHeight,
    });
    armed.current = decision.armed;
    if (decision.request) onEndReachedRef.current();
  };
  const requestNextPageRef = useRef(requestNextPage);
  requestNextPageRef.current = requestNextPage;

  useEffect(() => {
    if (!fillWhenShort) return;
    const metrics = metricsRef.current;
    if (metrics.viewportHeight <= 0 || metrics.contentHeight <= 0) return;
    if (metrics.contentHeight > metrics.viewportHeight) return;
    armed.current = true;
    requestNextPageRef.current();
  }, [fillWhenShort]);

  const rememberScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentInset, contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    metricsRef.current = {
      contentHeight: contentSize.height,
      insetBottom: contentInset?.bottom ?? 0,
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
    };
    requestNextPageRef.current();
  };

  const scroll = (
    <ScrollView
      // Explicit RN flex + background (not only NativeWind) so form sheets keep a
      // non-zero height and track light/dark theme.colors.
      style={{ backgroundColor: surfaceColor, flex: 1 }}
      contentContainerStyle={{
        backgroundColor: surfaceColor,
        flexGrow: contentFlex ? 1 : undefined,
        gap: spacing.sectionGap,
        paddingBottom: footer ? undefined : Math.max(spacing.screenBottom, tabBarInset),
        paddingHorizontal: spacing.screenX,
      }}
      alwaysBounceVertical
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={(_width, height) => {
        const previous = metricsRef.current.contentHeight;
        const viewport = metricsRef.current.viewportHeight;
        metricsRef.current = { ...metricsRef.current, contentHeight: height };
        if (
          fillWhenShortRef.current &&
          viewport > 0 &&
          height > 0 &&
          height <= viewport &&
          height !== previous
        ) {
          armed.current = true;
        }
        requestNextPageRef.current();
      }}
      onLayout={(event) => {
        metricsRef.current = {
          ...metricsRef.current,
          viewportHeight: event.nativeEvent.layout.height,
        };
        requestNextPageRef.current();
      }}
      onMomentumScrollEnd={onEndReached ? rememberScroll : undefined}
      onScroll={onEndReached ? rememberScroll : undefined}
      onScrollEndDrag={onEndReached ? rememberScroll : undefined}
      scrollEventThrottle={200}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            onRefresh={() => {
              void onRefresh();
            }}
            refreshing={refreshing}
            tintColor={theme.colors.secondaryLabel}
          />
        ) : undefined
      }
    >
      <View
        style={{
          flex: contentFlex ? 1 : undefined,
          gap: spacing.sectionGap,
          justifyContent: contentFlex ? "center" : undefined,
        }}
      >
        {disconnectedReason ? <ConnectionBanner message={disconnectedReason} /> : null}
        {children}
      </View>
      {footer ? <View style={{ height: footerClearance }} /> : null}
    </ScrollView>
  );

  // Keep ScrollView (+ optional sticky footer) as siblings under a fragment — same as
  // pre-P4. An outer flex column View collapses ScrollView height to 0 inside iOS
  // form sheets (Settings blank / Connect scan section missing) while the footer still paints.
  return (
    <>
      {scroll}
      {footer ? (
        <GlassPanel
          fallbackStyle={{ backgroundColor: theme.colors.glassFallbackStrong }}
          glassEffectStyle={{ style: "regular", animate: true }}
          shadow={false}
          style={{
            backgroundColor: theme.colors.glassFallbackStrong,
            borderRadius: 0,
            borderBottomWidth: 0,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderTopColor: theme.colors.glassBorder,
            borderTopWidth: StyleSheet.hairlineWidth,
            // Absolute dock: form-sheet flex columns collapse ScrollView; overlay +
            // measured content padding keeps CTAs reachable without blank sheets.
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
          }}
          tintColor={theme.colors.glassTint}
        >
          <View
            onLayout={handleFooterLayout}
            style={{
              paddingBottom: footerPaddingBottom,
              paddingHorizontal: spacing.screenX,
              paddingTop: spacing.screenFooterTop,
            }}
          >
            {footer}
          </View>
        </GlassPanel>
      ) : null}
    </>
  );
}

function ConnectionBanner({ message }: { message: string }) {
  const theme = useMobileTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.redSurface,
        borderColor: theme.colors.redBorder,
        borderCurve: "continuous",
        borderRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 4,
        padding: 12,
      }}
    >
      <Text
        selectable
        style={{
          color: theme.colors.label,
          fontSize: 13,
          fontWeight: "700",
          lineHeight: 18,
        }}
      >
        Disconnected
      </Text>
      <Text
        selectable
        style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}
      >
        {message}
      </Text>
    </View>
  );
}

export function Section({
  children,
  clip = true,
  label,
}: PropsWithChildren<{
  /** Clip children to the card. Turn off when a row needs a horizontal swipe. */
  clip?: boolean;
  label?: string;
}>) {
  const theme = useMobileTheme();

  return (
    <View style={{ gap: spacing.sectionLabelGap }}>
      {label ? (
        <Text
          style={{
            color: theme.colors.secondaryLabel,
            fontSize: 13,
            fontWeight: "600",
            lineHeight: 18,
            paddingHorizontal: spacing.sectionLabelX,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: theme.colors.cardElevated,
          borderColor: theme.colors.glassBorder,
          borderCurve: "continuous",
          borderRadius: 24,
          borderWidth: StyleSheet.hairlineWidth,
          minHeight: 1,
          overflow: clip ? "hidden" : "visible",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  layout = "centered",
}: {
  title: string;
  message: string;
  layout?: "centered" | "section";
}) {
  const theme = useMobileTheme();

  if (layout === "section") {
    return (
      <View style={{ gap: 4, paddingHorizontal: spacing.rowX, paddingVertical: 20 }}>
        <Text
          selectable
          style={{
            color: theme.colors.label,
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 21,
            textAlign: "left",
          }}
        >
          {title}
        </Text>
        <Text
          selectable
          style={{
            color: theme.colors.secondaryLabel,
            fontSize: 13,
            lineHeight: 19,
            textAlign: "left",
          }}
        >
          {message}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", gap: 8, padding: 24 }}>
      <Text
        selectable
        style={{
          color: theme.colors.label,
          fontSize: 17,
          fontWeight: "700",
          lineHeight: 22,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        selectable
        style={{
          color: theme.colors.secondaryLabel,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
        }}
      >
        {message}
      </Text>
    </View>
  );
}

/** Same spinner as pull-to-refresh, shown under the list while the next page loads. */
export function ListLoadMoreFooter({ loading = false }: { loading?: boolean }) {
  const theme = useMobileTheme();
  if (!loading) return null;

  return (
    <View
      accessibilityLabel="Loading more sessions"
      accessibilityState={{ busy: true }}
      style={{ alignItems: "center", justifyContent: "center", paddingVertical: 18 }}
    >
      <ActivityIndicator color={theme.colors.secondaryLabel} />
    </View>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  const theme = useMobileTheme();
  if (!message) return null;

  return (
    <View
      style={{
        alignSelf: "stretch",
        backgroundColor: theme.colors.redSurface,
        borderColor: theme.colors.redBorder,
        borderCurve: "continuous",
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text
        selectable
        style={{
          color: theme.colors.red,
          fontSize: 14,
          fontWeight: "500",
          lineHeight: 20,
          textAlign: "center",
        }}
      >
        {message}
      </Text>
    </View>
  );
}
