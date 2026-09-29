import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";

const MARK = require("../../assets/atmos-mark.png");
const MARK_ASPECT = 909 / 525;

/**
 * Same mark as the web `LogoSvg`. `breathe` matches `.atmos-logo-breathe`:
 * foreground fades between 28% and 100% over 2.6s.
 */
export function AtmosLogo({
  breathe = false,
  height = 80,
}: {
  breathe?: boolean;
  height?: number;
}) {
  const theme = useMobileTheme();
  const opacity = useRef(new Animated.Value(breathe ? 0.28 : 1)).current;

  useEffect(() => {
    if (!breathe) {
      opacity.setValue(1);
      return;
    }

    let stopped = false;
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (stopped) return;
      if (reduceMotion) {
        opacity.setValue(0.72);
        return;
      }
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.28,
            duration: 1300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });

    return () => {
      stopped = true;
      loop?.stop();
    };
  }, [breathe, opacity]);

  return (
    <Animated.Image
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={MARK}
      style={{
        height,
        opacity,
        tintColor: theme.colors.label,
        width: height * MARK_ASPECT,
      }}
    />
  );
}
