import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Svg, { Ellipse, Rect } from "react-native-svg";

/**
 * Max-effort jet from the web RangeSlider `maxEffect` track.
 * The motion model matches that exhaust: a leftward flame, stars, and sparks.
 * Drawn with SVG because the mobile app has no canvas.
 */

const FLAME_ORIGIN = 0.93;
const FLAME_LENGTH = 0.66;
const SPARK_COUNT = 18;
const STAR_COUNT = 28;

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  stretch: number;
  alpha: number;
};

type Star = {
  x: number;
  y: number;
  vx: number;
  size: number;
  alpha: number;
};

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

function fbm(x: number): number {
  return (
    valueNoise(x) * 0.52 +
    valueNoise(x * 2.07 + 19.2) * 0.27 +
    valueNoise(x * 4.13 + 47.8) * 0.14 +
    valueNoise(x * 8.29 + 91.4) * 0.07
  );
}

function flameEnvelope(u: number, falloff: number): number {
  if (u <= 0) return 1;
  if (u >= 1) return 0;
  return Math.pow(1 - u, falloff) * (1 - u * u * 0.42);
}

function advectPhase(u: number, t: number, freq: number, speed: number, seed: number): number {
  return u * freq - t * speed + seed;
}

function spawnSpark(width: number, height: number, rng: () => number): Spark {
  const along = rng();
  const nearTail = along > 0.42;
  const u = nearTail ? 0.22 + rng() * 0.45 : rng() * 0.16;
  const size = nearTail ? 0.28 + rng() * 0.5 : 0.45 + rng() * 0.95;
  return {
    x: width * (FLAME_ORIGIN - u * FLAME_LENGTH),
    y: height * (0.18 + rng() * 0.64),
    vx: -(55 + rng() * 140),
    vy: (rng() - 0.5) * 14,
    age: 0,
    life: 0.35 + rng() * 0.7,
    size,
    stretch: 0.85 + rng() * 1.7,
    alpha: 0.4 + rng() * 0.55,
  };
}

function createSparks(width: number, height: number): Spark[] {
  return Array.from({ length: SPARK_COUNT }, () => {
    const spark = spawnSpark(width, height, Math.random);
    spark.age = Math.random() * spark.life;
    spark.x += spark.vx * spark.age * 0.8;
    return spark;
  });
}

function createStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    const size = i % 5 === 0 ? 2.4 : i % 2 === 0 ? 1.45 : 0.9;
    return {
      x: hash(i * 19.1 + 3.7),
      y: 0.1 + hash(i * 47.3 + 8.2) * 0.8,
      vx: -(0.3 + size * 0.18 + hash(i * 6.4) * 0.15),
      size,
      alpha: 0.4 + hash(i * 3.1) * 0.5,
    };
  });
}

function stepStars(stars: Star[], dt: number): void {
  for (const star of stars) {
    if (star.vx > -0.25) star.vx = -0.32;
    star.x += star.vx * dt;
    if (star.x < -0.08) star.x += 1.16;
  }
}

function stepSparks(sparks: Spark[], width: number, height: number, dt: number): void {
  const tailX = width * (FLAME_ORIGIN - FLAME_LENGTH);
  for (const spark of sparks) {
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy *= 0.992;
    if (spark.age >= spark.life || spark.x < tailX - 6 || spark.vx >= 0) {
      Object.assign(spark, spawnSpark(width, height, Math.random));
    }
    if (spark.vx > -20) spark.vx = -20;
  }
}

type BodySample = { cy: number; ry: number; color: string; opacity: number };

function sampleBody(px: number, width: number, height: number, time: number): BodySample | null {
  const uRaw = (width * FLAME_ORIGIN - px) / (width * FLAME_LENGTH);
  if (uRaw < -0.06 || uRaw > 1.02) return null;
  const u = clamp01(uRaw);
  const env = flameEnvelope(u, 0.72);
  if (env < 0.01) return null;
  const turb = smoothstep(0.03, 0.18, u);
  const nRadius = fbm(advectPhase(u, time, 3.8, 2.2, 2.1));
  const nRadius2 = fbm(advectPhase(u, time, 9.4, 4.1, 7.6));
  const nShift = fbm(advectPhase(u, time, 2.1, 1.45, 19.4));
  const ry = Math.max(
    0.7,
    height * 0.56 * env * (1 + turb * ((nRadius - 0.38) * 1.15 + (nRadius2 - 0.5) * (0.55 + 0.7 * u))),
  );
  const heat = env;
  const core = Math.exp(-u * 2.55);
  const r = Math.min(255, 8 + 82 * heat + 240 * core);
  const g = Math.min(255, 55 + 200 * heat + 155 * core);
  const b = Math.min(255, 165 + 145 * heat + 15 * core);
  return {
    cy: height * 0.5 + (nShift - 0.5) * height * 0.34 * turb * env,
    ry,
    color: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
    opacity: Math.min(1, 0.22 + 0.9 * heat),
  };
}

export function EffortExhaust() {
  const [width, setWidth] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [, setFrame] = useState(0);
  const time = useRef(0.4);
  const sparks = useRef<Spark[]>([]);
  const stars = useRef<Star[]>([]);
  const height = 32;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (width < 8) return;
    sparks.current = createSparks(width, height);
    stars.current = createStars();
    setFrame((frame) => frame + 1);
  }, [width]);

  useEffect(() => {
    if (width < 8 || reduce) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time.current += dt;
      stepStars(stars.current, dt);
      stepSparks(sparks.current, width, height, dt);
      setFrame((frame) => frame + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, width]);

  const columns = width > 0 ? Math.max(8, Math.floor(width / 6)) : 0;
  const originX = width * FLAME_ORIGIN;

  return (
    <View
      onLayout={(event) => {
        const next = Math.ceil(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      pointerEvents="none"
      style={{
        backgroundColor: "#05070e",
        borderRadius: 16,
        height,
        left: 0,
        overflow: "hidden",
        position: "absolute",
        right: 0,
        top: 6,
      }}
    >
      {width > 0 ? (
        <Svg height={height} width={width}>
          {stars.current.map((star, index) => {
            let alpha = star.alpha;
            if (star.x < 0.06) alpha *= Math.max(0, star.x) / 0.06;
            else if (star.x > 0.94) alpha *= Math.max(0, 1 - star.x) / 0.06;
            const streak = star.size * (1.15 + Math.abs(star.vx) * 3.2);
            return (
              <Rect
                key={`star-${index}`}
                fill="#f4fbff"
                height={Math.max(1, star.size)}
                opacity={alpha}
                width={streak}
                x={star.x * width}
                y={star.y * height}
              />
            );
          })}
          {Array.from({ length: columns }, (_, index) => {
            const px = ((index + 0.5) / columns) * width;
            const sample = sampleBody(px, width, height, time.current);
            if (!sample) return null;
            return (
              <Ellipse
                key={`jet-${index}`}
                cx={px}
                cy={sample.cy}
                fill={sample.color}
                opacity={sample.opacity}
                rx={width / columns}
                ry={sample.ry}
              />
            );
          })}
          <Ellipse cx={originX - width * 0.04} cy={height * 0.5} fill="#ffffff" opacity={0.85} rx={10} ry={height * 0.28} />
          <Ellipse cx={originX - width * 0.08} cy={height * 0.5} fill="#9ad8ff" opacity={0.45} rx={width * 0.12} ry={height * 0.42} />
          {sparks.current.map((spark, index) => {
            const u = clamp01((originX - spark.x) / (width * FLAME_LENGTH));
            const fadeIn = clamp01(spark.age / 0.07);
            const fadeOut = 1 - spark.age / spark.life;
            const shrink = fadeOut * (1 - u * 0.78);
            if (shrink <= 0.04) return null;
            return (
              <Ellipse
                key={`spark-${index}`}
                cx={spark.x}
                cy={spark.y}
                fill="#f4fbff"
                opacity={spark.alpha * fadeIn * fadeOut * (0.3 + 0.7 * (1 - u))}
                rx={Math.max(0.28, spark.size * spark.stretch * shrink)}
                ry={Math.max(0.22, spark.size * 0.72 * shrink)}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
