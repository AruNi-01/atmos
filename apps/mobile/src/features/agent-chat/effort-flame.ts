/**
 * Pixel port of the web max-effort jet (`packages/ui` exhaust-flame).
 * Mobile cannot import that package. The motion model is the same:
 * a leftward flame, stars, and sparks. Noise phase is `u * freq - t * speed`
 * so the jet only travels toward the tail.
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

function blendPixel(data: Uint8Array, i: number, r: number, g: number, b: number, a: number): void {
  const srcA = a / 255;
  if (srcA <= 0.004 || i < 0 || i + 3 >= data.length) return;
  const dstA = data[i + 3]! / 255;
  const outA = srcA + dstA * (1 - srcA);
  const inv = 1 / outA;
  data[i] = (r * srcA + data[i]! * dstA * (1 - srcA)) * inv;
  data[i + 1] = (g * srcA + data[i + 1]! * dstA * (1 - srcA)) * inv;
  data[i + 2] = (b * srcA + data[i + 2]! * dstA * (1 - srcA)) * inv;
  data[i + 3] = outA * 255;
}

function addPixel(data: Uint8Array, i: number, r: number, g: number, b: number, a: number): void {
  if (a <= 1 || i < 0 || i + 3 >= data.length) return;
  const srcA = a / 255;
  data[i] = Math.min(255, data[i]! + r * srcA);
  data[i + 1] = Math.min(255, data[i + 1]! + g * srcA);
  data[i + 2] = Math.min(255, data[i + 2]! + b * srcA);
}

function fillNightSky(data: Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 5;
    data[i + 1] = 7;
    data[i + 2] = 14;
    data[i + 3] = 255;
  }
}

function stampRect(
  data: Uint8Array,
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
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      blendPixel(data, (py * width + px) * 4, 244, 251, 255, a);
    }
  }
}

function paintStars(data: Uint8Array, width: number, height: number, stars: Star[]): void {
  for (const star of stars) {
    let alpha = star.alpha;
    if (star.x < 0.06) alpha *= Math.max(0, star.x) / 0.06;
    else if (star.x > 0.94) alpha *= Math.max(0, 1 - star.x) / 0.06;
    const size = Math.max(1, star.size);
    const streak = size * (1.15 + Math.abs(star.vx) * 3.2);
    const cx = star.x * width;
    const cy = star.y * height;
    stampRect(data, width, height, cx, cy, streak + 1.4, size + 1.2, alpha * 0.28);
    stampRect(data, width, height, cx, cy, streak, size, alpha);
  }
}

function paintBody(data: Uint8Array, width: number, height: number, time: number): void {
  const cy = height * 0.5;
  for (let px = 0; px < width; px += 1) {
    const u = (width * FLAME_ORIGIN - px) / (width * FLAME_LENGTH);
    if (u < -0.06 || u > 1.02) continue;
    const uu = clamp01(u);
    const env = flameEnvelope(uu, 0.72);
    if (env < 0.01) continue;
    const turb = smoothstep(0.03, 0.18, uu);
    const nRadius = fbm(advectPhase(uu, time, 3.8, 2.2, 2.1));
    const nRadius2 = fbm(advectPhase(uu, time, 9.4, 4.1, 7.6));
    const nShift = fbm(advectPhase(uu, time, 2.1, 1.45, 19.4));
    const nWisp = fbm(advectPhase(uu, time, 6.8, 3.2, 11.2));
    const radius = Math.max(
      0.7,
      height * 0.56 * env * (1 + turb * ((nRadius - 0.38) * 1.15 + (nRadius2 - 0.5) * (0.55 + 0.7 * uu))),
    );
    const center = cy + (nShift - 0.5) * height * 0.34 * turb * env;
    const wispRadius = Math.max(0.45, height * 0.3 * env * (0.2 + turb * nWisp * 1.25));
    const wispCenter = cy + (nWisp - 0.46) * height * 0.5 * turb * env;
    const y0 = Math.max(0, Math.floor(Math.min(center, wispCenter) - Math.max(radius, wispRadius) * 1.2));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(center, wispCenter) + Math.max(radius, wispRadius) * 1.2));
    for (let py = y0; py <= y1; py += 1) {
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
      blendPixel(
        data,
        (py * width + px) * 4,
        r > 255 ? 255 : r,
        g > 255 ? 255 : g,
        b > 255 ? 255 : b,
        255 * Math.min(1, 0.22 + 0.9 * heat),
      );
    }
  }
}

function paintHotCore(data: Uint8Array, width: number, height: number): void {
  const originX = width * FLAME_ORIGIN;
  const cy = height * 0.5;
  const gx = originX - width * 0.03;
  const gy = cy;
  const radius = height * 0.62;
  const x0 = Math.max(0, Math.floor(originX - width * 0.22));
  const x1 = Math.min(width - 1, Math.ceil(originX + width * 0.04));
  const y0 = Math.max(0, Math.floor(height * 0.04));
  const y1 = Math.min(height - 1, Math.ceil(height * 0.96));
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const t = Math.hypot(px - gx, py - gy) / radius;
      if (t >= 1) continue;
      const white = smoothstep(0.28, 0, t);
      const ice = smoothstep(0.7, 0.28, t);
      const blue = smoothstep(1, 0.7, t);
      addPixel(data, (py * width + px) * 4, 255, 255, 255, 255 * 0.95 * white);
      addPixel(data, (py * width + px) * 4, 210, 242, 255, 255 * 0.5 * ice);
      addPixel(data, (py * width + px) * 4, 90, 190, 255, 255 * 0.12 * blue);
    }
  }
}

function stampEllipse(
  data: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha: number,
): void {
  if (alpha <= 0.02 || rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(height - 1, Math.ceil(cy + ry));
  const a = 255 * clamp01(alpha);
  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const nx = (px - cx) / rx;
      const ny = (py - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      blendPixel(data, (py * width + px) * 4, 244, 251, 255, a);
    }
  }
}

function paintSparks(data: Uint8Array, width: number, height: number, sparks: Spark[]): void {
  const originX = width * FLAME_ORIGIN;
  const length = width * FLAME_LENGTH;
  for (const spark of sparks) {
    const u = clamp01((originX - spark.x) / length);
    const fadeIn = clamp01(spark.age / 0.07);
    const fadeOut = 1 - spark.age / spark.life;
    const shrink = fadeOut * (1 - u * 0.78);
    if (shrink <= 0.04) continue;
    stampEllipse(
      data,
      width,
      height,
      spark.x,
      spark.y,
      Math.max(0.28, spark.size * spark.stretch * shrink),
      Math.max(0.22, spark.size * 0.72 * shrink),
      spark.alpha * fadeIn * fadeOut * (0.3 + 0.7 * (1 - u)),
    );
  }
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

export type EffortFlame = {
  paint: (time: number, dt: number, reduced: boolean) => Uint8Array;
  height: number;
  width: number;
};

export function createEffortFlame(width: number, height: number): EffortFlame {
  const sparks = createSparks(width, height);
  const stars = createStars();
  const frame = new Uint8Array(width * height * 4);
  return {
    height,
    width,
    paint(time, dt, reduced) {
      if (!reduced) {
        stepStars(stars, dt);
        stepSparks(sparks, width, height, dt);
      }
      fillNightSky(frame);
      paintStars(frame, width, height, stars);
      paintBody(frame, width, height, time);
      paintHotCore(frame, width, height);
      paintSparks(frame, width, height, sparks);
      return frame;
    },
  };
}
