/** Max-effort exhaust: a jet that only travels left and tapers toward the tail.
 *
 * Previous SVG turbulence ping-ponged `baseFrequency`, which made the blob
 * inhale and look like it was flowing back toward the thumb. Every noise
 * sample here is `u * freq - t * speed` so a feature of constant phase must
 * increase `u` (nozzle → tail) as time increases.
 */

export type Spark = {
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

export type Star = {
  /** 0–1 across the track. */
  x: number;
  y: number;
  /** Track-widths per second; always negative (leftward, with the jet). */
  vx: number;
  size: number;
  alpha: number;
};

/** Nozzle sits just left of the thumb. */
export const FLAME_ORIGIN = 0.93;
/** Jet covers ~2/3 of the track; the rest is starfield. */
export const FLAME_LENGTH = 0.66;

const SPARK_COUNT = 18;
const STAR_COUNT = 28;
const BG_R = 5;
const BG_G = 7;
const BG_B = 14;

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
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

export function fbm(x: number): number {
  return (
    valueNoise(x) * 0.52 +
    valueNoise(x * 2.07 + 19.2) * 0.27 +
    valueNoise(x * 4.13 + 47.8) * 0.14 +
    valueNoise(x * 8.29 + 91.4) * 0.07
  );
}

/** 0 at the nozzle (right), 1 at the tail (left). Strictly decreasing. */
export function flameEnvelope(u: number, falloff: number): number {
  if (u <= 0) return 1;
  if (u >= 1) return 0;
  // Stay thick through the first half, then pinch into a tongue.
  const body = Math.pow(1 - u, falloff);
  const pinch = 1 - u * u * 0.42;
  return body * pinch;
}

/** Phase for a leftward-advecting wave. */
export function advectPhase(u: number, t: number, freq: number, speed: number, seed: number): number {
  return u * freq - t * speed + seed;
}

/** `u` of a feature with constant phase. Increases with `t` → travels to the tail. */
export function featureU(t: number, freq: number, speed: number, phase: number): number {
  return (phase + t * speed) / freq;
}

function axialU(px: number, width: number): number {
  return (width * FLAME_ORIGIN - px) / (width * FLAME_LENGTH);
}

export function spawnSpark(width: number, height: number, rng: () => number): Spark {
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

export function createSparks(
  width: number,
  height: number,
  rng: () => number = Math.random,
  count = SPARK_COUNT,
): Spark[] {
  return Array.from({ length: count }, () => {
    const spark = spawnSpark(width, height, rng);
    spark.age = rng() * spark.life;
    spark.x += spark.vx * spark.age * 0.8;
    return spark;
  });
}

export function createStars(count = STAR_COUNT): Star[] {
  return Array.from({ length: count }, (_, i) => {
    const size = i % 5 === 0 ? 2.4 : i % 2 === 0 ? 1.45 : 0.9;
    return {
      x: hash(i * 19.1 + 3.7),
      y: 0.1 + hash(i * 47.3 + 8.2) * 0.8,
      // Nearer (bigger) stars cross faster — parallax, always left with the jet.
      vx: -(0.3 + size * 0.18 + hash(i * 6.4) * 0.15),
      size,
      alpha: 0.4 + hash(i * 3.1) * 0.5,
    };
  });
}

export function stepStars(stars: Star[], dt: number): void {
  for (const star of stars) {
    if (star.vx > -0.25) star.vx = -0.32;
    star.x += star.vx * dt;
    if (star.x < -0.08) star.x += 1.16;
  }
}

function fillNightSky(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = BG_R;
    data[i + 1] = BG_G;
    data[i + 2] = BG_B;
    data[i + 3] = 255;
  }
}

function blendPixel(
  data: Uint8ClampedArray,
  i: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const srcA = a / 255;
  if (srcA <= 0.004) return;
  const dstA = data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  const inv = 1 / outA;
  data[i] = (r * srcA + data[i] * dstA * (1 - srcA)) * inv;
  data[i + 1] = (g * srcA + data[i + 1] * dstA * (1 - srcA)) * inv;
  data[i + 2] = (b * srcA + data[i + 2] * dstA * (1 - srcA)) * inv;
  data[i + 3] = outA * 255;
}

function stampRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rw: number,
  rh: number,
  alpha: number,
): void {
  const a = 255 * clamp01(alpha);
  if (a < 2) return;
  const x0 = Math.max(0, Math.floor(cx - rw / 2));
  const y0 = Math.max(0, Math.floor(cy - rh / 2));
  const x1 = Math.min(width - 1, Math.ceil(cx + rw / 2));
  const y1 = Math.min(height - 1, Math.ceil(cy + rh / 2));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      blendPixel(data, (py * width + px) * 4, 244, 251, 255, a);
    }
  }
}

function paintStars(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  dpr: number,
  stars: Star[],
): void {
  for (const star of stars) {
    let alpha = star.alpha;
    if (star.x < 0.06) alpha *= Math.max(0, star.x) / 0.06;
    else if (star.x > 0.94) alpha *= Math.max(0, 1 - star.x) / 0.06;
    const cx = star.x * width;
    const cy = star.y * height;
    const size = Math.max(1, star.size * dpr);
    const streak = size * (1.15 + Math.abs(star.vx) * 3.2);
    stampRect(data, width, height, cx, cy, streak + 1.4 * dpr, size + 1.2 * dpr, alpha * 0.28);
    stampRect(data, width, height, cx, cy, streak, size, alpha);
  }
}

function paintBody(data: Uint8ClampedArray, width: number, height: number, time: number): void {
  const cy = height * 0.5;

  for (let px = 0; px < width; px++) {
    const u = axialU(px, width);
    if (u < -0.06 || u > 1.02) continue;
    const uu = u < 0 ? 0 : u > 1 ? 1 : u;
    const env = flameEnvelope(uu, 0.72);
    if (env < 0.01) continue;

    // Laminar at the nozzle, turbulent downstream — the core stays a stable
    // bright jet instead of breathing back toward the thumb.
    const turb = smoothstep(0.03, 0.18, uu);
    const nRadius = fbm(advectPhase(uu, time, 3.8, 2.2, 2.1));
    const nRadius2 = fbm(advectPhase(uu, time, 9.4, 4.1, 7.6));
    const nShift = fbm(advectPhase(uu, time, 2.1, 1.45, 19.4));
    const nWisp = fbm(advectPhase(uu, time, 6.8, 3.2, 11.2));

    const radius =
      Math.max(
        0.7,
        height *
          0.56 *
          env *
          (1 + turb * ((nRadius - 0.38) * 1.15 + (nRadius2 - 0.5) * (0.55 + 0.7 * uu))),
      );
    const yShift = (nShift - 0.5) * height * 0.34 * turb * env;
    const center = cy + yShift;

    const wispRadius = Math.max(0.45, height * 0.3 * env * (0.2 + turb * nWisp * 1.25));
    const wispCenter = cy + (nWisp - 0.46) * height * 0.5 * turb * env;

    const y0 = Math.max(0, Math.floor(Math.min(center, wispCenter) - Math.max(radius, wispRadius) * 1.2));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(center, wispCenter) + Math.max(radius, wispRadius) * 1.2));

    for (let py = y0; py <= y1; py++) {
      const main = smoothstep(1.04, 0.32, Math.abs(py - center) / radius);
      const wisp = 0.62 * smoothstep(1.02, 0.3, Math.abs(py - wispCenter) / wispRadius);
      const body = Math.max(main, wisp);
      if (body < 0.012) continue;

      const heat = body * env;
      const core = Math.pow(body, 2.2) * Math.exp(-uu * 2.55);
      const cyan = heat * (1 - uu * 0.22);

      const r = 8 + 12 * heat + 70 * cyan * heat + 240 * core;
      const g = 55 + 100 * heat + 100 * cyan * heat + 155 * core;
      const b = 140 + 145 * heat + 25 * cyan + 15 * core;
      const a = 255 * Math.min(1, 0.22 + 0.9 * heat);

      blendPixel(
        data,
        (py * width + px) * 4,
        r > 255 ? 255 : r,
        g > 255 ? 255 : g,
        b > 255 ? 255 : b,
        a,
      );
    }
  }
}

function stepSparks(
  sparks: Spark[],
  width: number,
  height: number,
  dt: number,
  rng: () => number,
): void {
  for (const spark of sparks) {
    spark.age += dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy *= 0.992;

    const tailX = width * (FLAME_ORIGIN - FLAME_LENGTH);
    if (spark.age >= spark.life || spark.x < tailX - 6 || spark.vx >= 0) {
      Object.assign(spark, spawnSpark(width, height, rng));
    }

    // Keep travel left-only even if a caller mutates vx.
    if (spark.vx > -20) spark.vx = -20;
  }
}

function drawSparks(
  ctx: CanvasRenderingContext2D,
  sparks: Spark[],
  width: number,
  height: number,
): void {
  const originX = width * FLAME_ORIGIN;
  const length = width * FLAME_LENGTH;

  for (const spark of sparks) {
    const u = clamp01((originX - spark.x) / length);
    const fadeIn = clamp01(spark.age / 0.07);
    const fadeOut = 1 - spark.age / spark.life;
    // Shrink with age and with distance from the nozzle.
    const shrink = fadeOut * (1 - u * 0.78);
    if (shrink <= 0.04) continue;

    const hw = Math.max(0.28, spark.size * spark.stretch * shrink);
    const hh = Math.max(0.22, spark.size * 0.72 * shrink);
    const alpha = spark.alpha * fadeIn * fadeOut * (0.3 + 0.7 * (1 - u));

    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#f4fbff";
    ctx.beginPath();
    ctx.ellipse(spark.x, spark.y, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHotCore(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const originX = width * FLAME_ORIGIN;
  const cy = height * 0.5;
  const glow = ctx.createRadialGradient(originX - width * 0.03, cy, 0, originX - width * 0.08, cy, height * 0.62);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.28, "rgba(210,242,255,0.5)");
  glow.addColorStop(0.7, "rgba(90,190,255,0.12)");
  glow.addColorStop(1, "rgba(10,40,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(originX - width * 0.22, height * 0.04, width * 0.26, height * 0.92);
}

export function paintExhaustFlame(options: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  time: number;
  dt: number;
  sparks: Spark[];
  stars: Star[];
  reducedMotion: boolean;
  buffer: ImageData | null;
  rng?: () => number;
}): ImageData {
  const { ctx, width, height, dpr, time, sparks, stars, reducedMotion } = options;
  const rng = options.rng ?? Math.random;
  const dt = reducedMotion ? 0 : options.dt;
  const cw = Math.max(1, Math.round(width * dpr));
  const ch = Math.max(1, Math.round(height * dpr));

  let buffer = options.buffer;
  if (!buffer || buffer.width !== cw || buffer.height !== ch) {
    buffer = ctx.createImageData(cw, ch);
  }

  if (!reducedMotion) {
    stepStars(stars, dt);
  }
  fillNightSky(buffer.data);
  paintStars(buffer.data, cw, ch, dpr, stars);
  paintBody(buffer.data, cw, ch, time);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(buffer, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.globalCompositeOperation = "lighter";
  drawHotCore(ctx, width, height);
  ctx.globalCompositeOperation = "source-over";

  if (!reducedMotion) {
    stepSparks(sparks, width, height, dt, rng);
  }
  drawSparks(ctx, sparks, width, height);

  return buffer;
}
