import { StyleSheet, View } from "react-native";
import { Canvas, Circle, Group, Mask, Points, RadialGradient, Rect } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type DerivedValue } from "react-native-reanimated";

/**
 * Phone port of the web share placeholder (`ImageGenerationCanvas`): a fixed
 * dot field and two elliptical glows that morph. Motion stays on the UI thread
 * so the long-screenshot encode does not freeze it. Reduced motion holds the
 * resting frame.
 */

const GAP = 11;
const MORPH_MS = 4200;
const BREATHE_MS = 1900;

type Blob = { h: number; w: number; x: number; y: number };
type Pose = { a: Blob; b: Blob; opacity: number };

const REST_A: Blob = { h: 0.62, w: 0.72, x: 0.16, y: 0.2 };
const REST_B: Blob = { h: 0.52, w: 0.52, x: 0.3, y: 0.32 };
const KEYS: Blob[] = [
  { h: 0.46, w: 0.52, x: 0.16, y: 0.2 },
  { h: 0.58, w: 0.46, x: 0.84, y: 0.16 },
  { h: 0.44, w: 0.6, x: 0.82, y: 0.84 },
  { h: 0.54, w: 0.48, x: 0.14, y: 0.82 },
  { h: 0.46, w: 0.52, x: 0.16, y: 0.2 },
];
const KEYS_B: Blob[] = [
  { h: 0.4, w: 0.4, x: 0.3, y: 0.32 },
  { h: 0.38, w: 0.44, x: 0.66, y: 0.3 },
  { h: 0.46, w: 0.38, x: 0.62, y: 0.68 },
  { h: 0.4, w: 0.46, x: 0.34, y: 0.66 },
  { h: 0.4, w: 0.4, x: 0.3, y: 0.32 },
];

function unitBezier(u: number, c1: number, c2: number) {
  "worklet";
  const v = 1 - u;
  return 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u;
}

function unitBezierSlope(u: number, c1: number, c2: number) {
  "worklet";
  const v = 1 - u;
  return 3 * v * v * c1 + 6 * v * u * (c2 - c1) + 3 * u * u * (1 - c2);
}

function ease(t: number, x1: number, y1: number, x2: number, y2: number) {
  "worklet";
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 5; i += 1) {
    const slope = unitBezierSlope(u, x1, x2);
    if (Math.abs(slope) < 1e-3) break;
    u -= (unitBezier(u, x1, x2) - t) / slope;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
  }
  return unitBezier(u, y1, y2);
}

function mixBlob(from: Blob, to: Blob, t: number): Blob {
  "worklet";
  return {
    h: from.h + (to.h - from.h) * t,
    w: from.w + (to.w - from.w) * t,
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function poseAt(elapsed: number, reduced: boolean): Pose {
  "worklet";
  if (reduced) return { a: REST_A, b: REST_B, opacity: 0.7 };
  const morph = (elapsed % MORPH_MS) / MORPH_MS;
  const segment = Math.min(3, Math.floor(morph * 4));
  const local = ease(morph * 4 - segment, 0.35, 1.55, 0.65, 1);
  const breatheT = (elapsed % BREATHE_MS) / BREATHE_MS;
  const breatheLocal = breatheT < 0.5 ? breatheT / 0.5 : (breatheT - 0.5) / 0.5;
  const breathe = ease(breatheLocal, 0.66, 0, 0.34, 1);
  const opacity = breatheT < 0.5 ? 0.55 + 0.45 * breathe : 1 - 0.45 * breathe;
  return {
    a: mixBlob(KEYS[segment] ?? REST_A, KEYS[segment + 1] ?? REST_A, local),
    b: mixBlob(KEYS_B[segment] ?? REST_B, KEYS_B[segment + 1] ?? REST_B, local),
    opacity,
  };
}

function rectFor(blob: Blob, width: number, height: number) {
  "worklet";
  const w = blob.w * width;
  const h = blob.h * height;
  return { height: h, width: w, x: (width - w) * blob.x, y: (height - h) * blob.y };
}

function asSkia<T>(value: DerivedValue<T>): T {
  return value as unknown as T;
}

function Glow({ rect }: { rect: DerivedValue<{ height: number; width: number; x: number; y: number }> }) {
  const origin = useDerivedValue(() => {
    const next = rect.get();
    return { x: next.x + next.width / 2, y: next.y + next.height / 2 };
  });
  const transform = useDerivedValue(() => {
    const next = rect.get();
    return [{ scaleX: Math.max(next.width / 2, 1) }, { scaleY: Math.max(next.height / 2, 1) }];
  });
  return (
    <Group origin={asSkia(origin)} transform={asSkia(transform)}>
      <Circle c={asSkia(origin)} r={1}>
        <RadialGradient
          c={asSkia(origin)}
          colors={["rgba(255,255,255,1)", "rgba(255,255,255,1)", "rgba(255,255,255,0)"]}
          positions={[0, 0.12, 0.6]}
          r={1}
        />
      </Circle>
    </Group>
  );
}

function dotPoints(width: number, height: number) {
  "worklet";
  if (width < 1 || height < 1) return [];
  const columns = Math.ceil(width / GAP) + 1;
  const rows = Math.ceil(height / GAP) + 1;
  const offsetX = (width - (columns - 1) * GAP) / 2;
  const offsetY = (height - (rows - 1) * GAP) / 2;
  const points = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      points.push({ x: offsetX + column * GAP, y: offsetY + row * GAP });
    }
  }
  return points;
}

export function UsageShareGenerating({ dark }: { dark: boolean }) {
  const reduced = useReducedMotion() === true;
  const size = useSharedValue({ height: 0, width: 0 });
  const time = useSharedValue(0);
  useFrameCallback((frame) => {
    time.set(frame.timeSinceFirstFrame);
  }, !reduced);
  const points = useDerivedValue(() => {
    const next = size.get();
    return dotPoints(next.width, next.height);
  });
  const pose = useDerivedValue(() => poseAt(reduced ? 0 : time.get(), reduced), [reduced]);
  const rectA = useDerivedValue(() => {
    const next = size.get();
    return rectFor(pose.get().a, next.width, next.height);
  });
  const rectB = useDerivedValue(() => {
    const next = size.get();
    return rectFor(pose.get().b, next.width, next.height);
  });
  const opacity = useDerivedValue(() => pose.get().opacity);
  const plotWidth = useDerivedValue(() => size.get().width);
  const plotHeight = useDerivedValue(() => size.get().height);
  const background = dark ? "#1f1f1f" : "#fafafa";
  const bright = dark ? "#f5f5f5" : "#0b0d12";

  return (
    <View accessibilityLabel="Generating image" accessibilityState={{ busy: true }} style={[styles.frame, { backgroundColor: background }]}>
      <Canvas onSize={size} style={StyleSheet.absoluteFill}>
        <Rect color={background} height={asSkia(plotHeight)} width={asSkia(plotWidth)} x={0} y={0} />
        <Points color="rgba(161,161,161,0.22)" mode="points" points={asSkia(points)} strokeCap="round" strokeWidth={1.4} />
        <Group opacity={asSkia(opacity)}>
          <Mask
            mask={
              <Group>
                <Glow rect={rectA} />
                <Glow rect={rectB} />
              </Group>
            }
            mode="alpha"
          >
            <Points color={bright} mode="points" points={asSkia(points)} strokeCap="round" strokeWidth={2.2} />
          </Mask>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flexShrink: 0, height: 168, width: "100%" },
});
