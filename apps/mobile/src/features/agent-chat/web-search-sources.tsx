import { useEffect, useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChevronDownIcon, GlobeIcon } from "@/ui/icons/lucide-native";
import { useMobileTheme } from "@/theme/theme-store";
import { copy } from "./copy";
import { useReducedMotion } from "./motion/use-reduced-motion";
import {
  WEB_SEARCH_CHEVRON_MS,
  WEB_SEARCH_ROW_FADE_DELAY_MS,
  WEB_SEARCH_ROW_FADE_MS,
  WEB_SEARCH_STACK_LIMIT,
  WEB_SEARCH_STEP_MS,
  nextWebSearchShown,
  webSearchFaviconCandidates,
  webSearchOverflow,
  webSearchRowVisible,
  webSearchStackWidth,
} from "./web-search-stack";

const MARK = 20;
const STACK_SPRING = { damping: 36, stiffness: 420 };

export function WebSearchSources({
  links,
}: {
  links: ReadonlyArray<{ title: string; url: string; openable: boolean }>;
}) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(0);
  const total = links.length;
  const visibleCount = reduced ? (open ? total : 0) : shown;
  const stacked = links.slice(0, WEB_SEARCH_STACK_LIMIT);
  const stillStacked = stacked.filter(
    (_, index) => !webSearchRowVisible(index, visibleCount, total),
  ).length;
  const overflow = webSearchOverflow(total);
  const stackWidth = webSearchStackWidth(stillStacked);
  const width = useSharedValue(stackWidth);
  const rotation = useSharedValue(open ? 180 : 0);

  useEffect(() => {
    if (reduced) return;
    if (open && shown >= total) return;
    if (!open && shown === 0) return;
    const timer = setTimeout(() => {
      setShown((current) => nextWebSearchShown(open, current, total));
    }, WEB_SEARCH_STEP_MS);
    return () => clearTimeout(timer);
  }, [open, reduced, shown, total]);

  useEffect(() => {
    const nextWidth = webSearchStackWidth(stillStacked);
    if (reduced) {
      width.set(nextWidth);
      return;
    }
    width.set(withDelay(70, withSpring(nextWidth, STACK_SPRING)));
  }, [reduced, stillStacked, width]);

  useEffect(() => {
    const next = open ? 180 : 0;
    if (reduced) {
      rotation.set(next);
      return;
    }
    rotation.set(
      withTiming(next, { duration: WEB_SEARCH_CHEVRON_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [open, reduced, rotation]);

  const stackStyle = useAnimatedStyle(() => ({ width: width.get() }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  if (total === 0) return null;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{ alignItems: "center", flexDirection: "row" }}
      >
        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 20 }}>
          {copy.webSearchSources}
        </Text>
        <Animated.View style={[{ marginLeft: 8, overflow: "hidden" }, stackStyle]}>
          <View style={{ flexDirection: "row" }}>
            {stacked.map((link, index) =>
              webSearchRowVisible(index, visibleCount, total) ? null : (
                <View key={`${link.url}:${index}`} style={{ marginLeft: index === 0 ? 0 : -6 }}>
                  <FaviconMark url={link.url} />
                </View>
              ),
            )}
          </View>
        </Animated.View>
        {overflow > 0 && visibleCount === 0 ? (
          <Text
            style={{
              color: theme.colors.secondaryLabel,
              fontSize: 13,
              lineHeight: 20,
              marginLeft: 8,
              opacity: 0.8,
            }}
          >
            +{overflow}
          </Text>
        ) : null}
        <Animated.View style={[{ marginLeft: 4, opacity: 0.6 }, chevronStyle]}>
          <ChevronDownIcon color={theme.colors.secondaryLabel} size={16} strokeWidth={2} />
        </Animated.View>
      </Pressable>
      {links.map((link, index) =>
        webSearchRowVisible(index, visibleCount, total) ? (
          <SourceRow key={`${link.url}:${index}`} link={link} reduced={reduced} />
        ) : null,
      )}
    </View>
  );
}

function SourceRow({
  link,
  reduced,
}: {
  link: { title: string; url: string; openable: boolean };
  reduced: boolean;
}) {
  const theme = useMobileTheme();
  const opacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      return;
    }
    opacity.set(
      withDelay(
        WEB_SEARCH_ROW_FADE_DELAY_MS,
        withTiming(1, { duration: WEB_SEARCH_ROW_FADE_MS, easing: Easing.linear }),
      ),
    );
  }, [opacity, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const title = (
    <Text
      numberOfLines={1}
      style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 13, lineHeight: 20 }}
    >
      {link.title}
    </Text>
  );

  return (
    <Animated.View style={style}>
      {link.openable ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(link.url);
          }}
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 4,
            paddingVertical: 4,
          }}
        >
          <FaviconMark url={link.url} />
          {title}
        </Pressable>
      ) : (
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 4,
            paddingVertical: 4,
          }}
        >
          <FaviconMark url={link.url} />
          {title}
        </View>
      )}
    </Animated.View>
  );
}

/** Web `SiteFavicon`: the site icon, then a globe once every candidate fails. */
export function HttpFavicon({ url, size, radius }: { url: string; size: number; radius: number }) {
  const theme = useMobileTheme();
  const candidates = webSearchFaviconCandidates(url);
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  return (
    <View
      style={{
        alignItems: "center",
        borderRadius: radius,
        height: size,
        justifyContent: "center",
        overflow: "hidden",
        width: size,
      }}
    >
      {src ? (
        <Image
          alt=""
          onError={() => setIndex((current) => current + 1)}
          source={{ uri: src }}
          style={{ height: size, width: size }}
        />
      ) : (
        <GlobeIcon color={theme.colors.secondaryLabel} size={size} strokeWidth={2} />
      )}
    </View>
  );
}

function FaviconMark({ url }: { url: string }) {
  const theme = useMobileTheme();
  const candidates = webSearchFaviconCandidates(url);
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.background,
        borderColor: theme.colors.glassBorder,
        borderRadius: 999,
        borderWidth: 1,
        height: MARK,
        justifyContent: "center",
        overflow: "hidden",
        width: MARK,
      }}
    >
      {src ? (
        <Image
          alt=""
          onError={() => setIndex((current) => current + 1)}
          source={{ uri: src }}
          style={{ height: 12, width: 12 }}
        />
      ) : (
        <View
          style={{
            backgroundColor: theme.colors.secondaryLabel,
            borderRadius: 999,
            height: 8,
            opacity: 0.3,
            width: 8,
          }}
        />
      )}
    </View>
  );
}
