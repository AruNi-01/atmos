import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useMobileTheme } from "@/theme/theme-store";
import {
  GLYPH_BOX,
  GLYPH_SIZE,
  LATTICE_DIM,
  LATTICE_DIM_DARK,
  LATTICE_DOT,
  LATTICE_OFFSET,
  LATTICE_REST,
  LATTICE_REST_DARK,
  LATTICE_STAGE,
  STAR_LAYOUT,
  STAR_PATH,
  STAR_PERIOD_MS,
  glyphPhase,
  latticeCells,
  latticeDurationMs,
  latticeMotion,
  latticeSample,
  pickLatticeVariant,
  starDelayMs,
  starTwinkle,
  type LatticeCell,
  type LatticeVariant,
} from "./activity-glyph";
import { useReducedMotion } from "./motion/use-reduced-motion";

const SCALE = GLYPH_SIZE / LATTICE_STAGE;

function LatticeDot({
  cell,
  color,
  dim,
  duration,
  motion,
  progress,
  reduced,
  rest,
}: {
  cell: LatticeCell;
  color: string;
  dim: number;
  duration: number;
  motion: "comet" | "wave";
  progress: SharedValue<number>;
  reduced: boolean;
  rest: number;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) {
      return { opacity: cell.mid ? 1 : rest, transform: [{ scale: 1 }] };
    }
    if (cell.still) return { opacity: dim, transform: [{ scale: 1 }] };
    const sample = latticeSample(glyphPhase(progress.get(), cell.delay, duration), rest, motion);
    return { opacity: sample.opacity, transform: [{ scale: sample.scale }] };
  });
  const size = LATTICE_DOT * SCALE;
  return (
    <Animated.View
      style={[
        {
          backgroundColor: color,
          borderRadius: size / 2,
          height: size,
          left: (LATTICE_OFFSET + cell.left) * SCALE,
          position: "absolute",
          top: (LATTICE_OFFSET + cell.top) * SCALE,
          width: size,
        },
        style,
      ]}
    />
  );
}

function LatticeGlyph({
  color,
  reduced,
  variant,
}: {
  color: string;
  reduced: boolean;
  variant: LatticeVariant;
}) {
  const theme = useMobileTheme();
  const rest = theme.isDark ? LATTICE_REST_DARK : LATTICE_REST;
  const dim = theme.isDark ? LATTICE_DIM_DARK : LATTICE_DIM;
  const duration = latticeDurationMs(variant);
  const motion = latticeMotion(variant);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      progress.set(0);
      return;
    }
    progress.set(0);
    progress.set(withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [duration, progress, reduced]);

  return (
    <View style={{ height: GLYPH_SIZE, width: GLYPH_SIZE }}>
      {latticeCells(variant).map((cell) => (
        <LatticeDot
          key={cell.key}
          cell={cell}
          color={color}
          dim={dim}
          duration={duration}
          motion={motion}
          progress={progress}
          reduced={reduced}
          rest={rest}
        />
      ))}
    </View>
  );
}

function StarGlyph({ color, reduced }: { color: string; reduced: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      progress.set(0);
      return;
    }
    progress.set(0);
    progress.set(
      withRepeat(withTiming(1, { duration: STAR_PERIOD_MS, easing: Easing.linear }), -1, false),
    );
  }, [progress, reduced]);

  return (
    <View style={{ height: GLYPH_SIZE, width: GLYPH_SIZE }}>
      {STAR_LAYOUT.map((star, index) => (
        <StarDot
          key={star.x}
          color={color}
          index={index}
          progress={progress}
          reduced={reduced}
          star={star}
        />
      ))}
    </View>
  );
}

function StarDot({
  color,
  index,
  progress,
  reduced,
  star,
}: {
  color: string;
  index: number;
  progress: SharedValue<number>;
  reduced: boolean;
  star: (typeof STAR_LAYOUT)[number];
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0.7, transform: [{ scale: 1 }] };
    const sample = starTwinkle(glyphPhase(progress.get(), starDelayMs(index), STAR_PERIOD_MS));
    return { opacity: sample.opacity, transform: [{ scale: sample.scale }] };
  });
  const base = GLYPH_SIZE / 1.5;
  const size = base * star.scale;
  return (
    <Animated.View
      style={[
        {
          height: size,
          left: (star.x / 100) * GLYPH_SIZE - size / 2,
          position: "absolute",
          top: (star.y / 100) * GLYPH_SIZE - size / 2,
          width: size,
        },
        style,
      ]}
    >
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Path d={STAR_PATH} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export function ActivityGlyph({ kind }: { kind: "thinking" | "working" }) {
  const theme = useMobileTheme();
  const reduced = useReducedMotion();
  const [lattice] = useState(pickLatticeVariant);
  const color = theme.colors.secondaryLabel;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: "center",
        height: GLYPH_BOX,
        justifyContent: "center",
        overflow: "visible",
        width: GLYPH_BOX,
      }}
    >
      {kind === "thinking" ? (
        <StarGlyph color={color} reduced={reduced} />
      ) : (
        <LatticeGlyph color={color} reduced={reduced} variant={lattice} />
      )}
    </View>
  );
}
