import { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { EffortExhaust } from "./effort-exhaust";

const TRACK_HEIGHT = 32;
const THUMB_WIDTH = 14;
const THUMB_HEIGHT = 24;

export function EffortSlider(props: {
  max: number;
  onChange: (index: number) => void;
  value: number;
}) {
  const theme = useMobileTheme();
  const max = Math.max(0, props.max);
  const index = Math.max(0, Math.min(max, props.value));
  const atMax = max > 0 && index >= max;
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [showFlame, setShowFlame] = useState(atMax);
  const widthRef = useRef(0);
  const indexRef = useRef(index);
  indexRef.current = index;
  const exhaust = useRef(new Animated.Value(atMax ? 1 : 0)).current;

  useEffect(() => {
    if (atMax) setShowFlame(true);
    const animation = Animated.timing(exhaust, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: atMax ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !atMax) setShowFlame(false);
    });
    return () => animation.stop();
  }, [atMax, exhaust]);

  const ratio = drag ?? (max === 0 ? 0 : index / max);
  const thumbLeft = width > THUMB_WIDTH ? ratio * (width - THUMB_WIDTH) : 0;
  const steps = max > 0 && max <= 50 ? max : 0;
  const idle = theme.isDark ? "rgba(0,0,0,0.55)" : "rgba(17,17,18,0.10)";
  const fill = theme.isDark ? "rgba(255,255,255,0.18)" : "rgba(17,17,18,0.15)";
  const tick = theme.isDark ? "rgba(255,255,255,0.35)" : "rgba(17,17,18,0.30)";

  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;
  const commit = (x: number, finished: boolean) => {
    const track = widthRef.current;
    if (track <= 0 || max <= 0) {
      if (finished) setDrag(null);
      return;
    }
    const nextRatio = Math.max(0, Math.min(1, x / track));
    const next = Math.max(0, Math.min(max, Math.round(nextRatio * max)));
    setDrag(finished ? null : nextRatio);
    if (next !== indexRef.current) onChangeRef.current(next);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => commitRef.current(event.nativeEvent.locationX, false),
    onPanResponderMove: (event) => commitRef.current(event.nativeEvent.locationX, false),
    onPanResponderRelease: (event) => commitRef.current(event.nativeEvent.locationX, true),
    onPanResponderTerminate: (event) => commitRef.current(event.nativeEvent.locationX, true),
  })).current;

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityValue={{ max, min: 0, now: index }}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        widthRef.current = next;
        setWidth((current) => (current === next ? current : next));
      }}
      style={{
        backgroundColor: idle,
        borderRadius: TRACK_HEIGHT / 2,
        height: TRACK_HEIGHT,
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
        <View
          pointerEvents="none"
          style={{
            backgroundColor: fill,
            borderRadius: TRACK_HEIGHT / 2,
            bottom: 0,
            left: 0,
            opacity: atMax ? 0 : 1,
            position: "absolute",
            top: 0,
            width: `${ratio * 100}%`,
          }}
        />
        {steps > 0 ? (
          <View
            pointerEvents="none"
            style={{
              bottom: 0,
              left: 12,
              opacity: atMax ? 0 : 1,
              position: "absolute",
              right: 12,
              top: 0,
            }}
          >
            {Array.from({ length: steps + 1 }, (_, step) => (
              <View
                key={step}
                style={{
                  backgroundColor: tick,
                  borderRadius: 1,
                  height: 14,
                  left: `${(step / steps) * 100}%`,
                  marginLeft: -1,
                  position: "absolute",
                  top: (TRACK_HEIGHT - 14) / 2,
                  width: 2,
                }}
              />
            ))}
          </View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={{
            bottom: 0,
            left: 0,
            opacity: exhaust,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          {showFlame ? <EffortExhaust /> : null}
        </Animated.View>
        <View
          pointerEvents="none"
          style={{
            backgroundColor: atMax ? "#ffffff" : theme.isDark ? "#d4d4d4" : "rgba(17,17,18,0.45)",
            borderRadius: 6,
            height: THUMB_HEIGHT,
            left: thumbLeft,
            position: "absolute",
            shadowColor: atMax ? "#bae6fd" : "#000000",
            shadowOffset: { height: 0, width: 0 },
            shadowOpacity: atMax ? 0.9 : 0.12,
            shadowRadius: atMax ? 8 : 2,
            top: (TRACK_HEIGHT - THUMB_HEIGHT) / 2,
            width: THUMB_WIDTH,
          }}
        />
      </View>
  );
}
