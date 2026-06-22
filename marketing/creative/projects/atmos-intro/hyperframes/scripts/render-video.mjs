import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { syncRuntimeAssets } from "./sync-runtime-assets.mjs";

const __filename = fileURLToPath(import.meta.url);
const hyperframesDir = path.resolve(path.dirname(__filename), "..");
const projectDir = path.resolve(hyperframesDir, "..");
const repoRoot = path.resolve(projectDir, "../../../..");
const indexPath = path.join(hyperframesDir, "index.html");
const framesDir = path.join(hyperframesDir, ".render-frames");
const outputPath = path.join(projectDir, "artifacts/videos/atmos-intro-16x9-1080p.mp4");
const posterPath = path.join(projectDir, "artifacts/images/atmos-intro-16x9-1080p-poster.jpg");
const musicPath = path.join(projectDir, "artifacts/audio/atmos-ambient.wav");
const consumerTargets = [
  {
    name: "landing public",
    video: path.join(repoRoot, "apps/landing/public/videos/atmos-intro.mp4"),
    poster: path.join(repoRoot, "apps/landing/public/videos/atmos-intro-poster.jpg"),
  },
];

const width = 1920;
const height = 1080;
const fps = 30;
const durationSeconds = 30;
const totalFrames = durationSeconds * fps;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function ensureReady(page) {
  await page.goto(pathToFileURL(indexPath).href, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  await page.waitForFunction(() => Boolean(window.gsap && window.__timelines?.main), null, {
    timeout: 30_000,
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => {
        if (img.complete && img.naturalWidth > 0) return true;
        return new Promise((resolve, reject) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", reject, { once: true });
        });
      }),
    );
    window.__timelines.main.pause(0);
  });
}

async function captureFrames() {
  await syncRuntimeAssets();
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(posterPath), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
  });

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  page.on("pageerror", (error) => {
    console.error("[pageerror]", error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error("[console]", message.text());
  });

  await ensureReady(page);

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const seconds = frame / fps;
    await page.evaluate((time) => {
      const timeline = window.__timelines.main;
      timeline.pause();
      timeline.time(time, false);
    }, seconds);

    const file = path.join(framesDir, `frame-${String(frame + 1).padStart(4, "0")}.jpg`);
    await page.screenshot({
      path: file,
      type: "jpeg",
      quality: 95,
      clip: { x: 0, y: 0, width, height },
    });

    if (frame % fps === 0) {
      console.log(`captured ${String(frame).padStart(3, " ")} / ${totalFrames}`);
    }
  }

  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
}

async function encodeVideo() {
  await fs.copyFile(path.join(framesDir, "frame-0037.jpg"), posterPath);
  const hasMusic = await fs
    .access(musicPath)
    .then(() => true)
    .catch(() => false);
  const args = [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "frame-%04d.jpg"),
  ];

  if (hasMusic) {
    args.push("-i", musicPath);
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
  );

  if (hasMusic) {
    args.push(
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-af",
      "afade=t=in:st=0:d=1.2,afade=t=out:st=28.2:d=1.8,alimiter=limit=0.86",
    );
  }

  args.push(
    "-movflags",
    "+faststart",
    outputPath,
  );

  await run("ffmpeg", args);
}

async function syncConsumerTargets() {
  for (const target of consumerTargets) {
    await fs.mkdir(path.dirname(target.video), { recursive: true });
    await fs.mkdir(path.dirname(target.poster), { recursive: true });
    await fs.copyFile(outputPath, target.video);
    await fs.copyFile(posterPath, target.poster);
    console.log(`synced ${target.name} video ${target.video}`);
    console.log(`synced ${target.name} poster ${target.poster}`);
  }
}

try {
  await captureFrames();
  await encodeVideo();
  await syncConsumerTargets();
  await fs.rm(framesDir, { recursive: true, force: true });
  console.log(`wrote ${outputPath}`);
  console.log(`wrote ${posterPath}`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
