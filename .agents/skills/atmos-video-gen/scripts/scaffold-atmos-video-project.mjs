#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 30,
  audioMode: "ask",
  consumer: "",
};

function usage() {
  console.error(`Usage: node scaffold-atmos-video-project.mjs <project-name> [options]

Options:
  --root <path>              Repository root. Defaults to current working directory.
  --width <number>           Video width. Defaults to 1920.
  --height <number>          Video height. Defaults to 1080.
  --fps <number>             Frames per second. Defaults to 30.
  --duration <seconds>       Video duration. Defaults to 30.
  --audio-mode <mode>        ask | generate | none | existing. Defaults to ask.
  --consumer <name>          Optional consuming app target, e.g. landing.
  --force                    Overwrite existing scaffold files.`);
}

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseArgs(argv) {
  const args = [...argv];
  const rawName = args.shift();
  if (!rawName) {
    usage();
    process.exit(1);
  }

  const options = { ...DEFAULTS, projectName: normalizeName(rawName), force: false };
  if (!options.projectName) {
    console.error("[ERROR] Project name must contain at least one letter or number.");
    process.exit(1);
  }

  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--force") {
      options.force = true;
      continue;
    }

    const value = args.shift();
    if (!value) {
      console.error(`[ERROR] Missing value for ${flag}`);
      process.exit(1);
    }

    switch (flag) {
      case "--root":
        options.root = value;
        break;
      case "--width":
      case "--height":
      case "--fps":
      case "--duration":
        options[flag.slice(2)] = Number(value);
        break;
      case "--audio-mode":
        options.audioMode = value;
        break;
      case "--consumer":
        options.consumer = value;
        break;
      default:
        console.error(`[ERROR] Unknown option: ${flag}`);
        usage();
        process.exit(1);
    }
  }

  if (!["ask", "generate", "none", "existing"].includes(options.audioMode)) {
    console.error("[ERROR] --audio-mode must be ask, generate, none, or existing.");
    process.exit(1);
  }

  for (const key of ["width", "height", "fps", "duration"]) {
    if (!Number.isFinite(options[key]) || options[key] <= 0) {
      console.error(`[ERROR] --${key} must be a positive number.`);
      process.exit(1);
    }
  }

  return options;
}

async function writeFileOnce(filePath, content, force) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!force) {
    try {
      await fs.access(filePath);
      console.log(`kept ${filePath}`);
      return;
    } catch {
      // file does not exist
    }
  }
  await fs.writeFile(filePath, content);
  console.log(`wrote ${filePath}`);
}

function aspectSlug(width, height) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}x${height / divisor}`;
}

function projectAgents({ projectName, duration, width, height, fps, audioMode, consumer }) {
  const consumerNote = consumer
    ? `\nThis project currently syncs deployable copies to the \`${consumer}\` app target when the render script is configured for it.\n`
    : "";

  return `# ${projectName} Creative - AGENTS.md

> Atmos marketing video creative project.

---

## Contract

- Source project: \`marketing/creative/projects/${projectName}/\`
- HyperFrames app: \`hyperframes/\`
- Artifacts: \`artifacts/audio\`, \`artifacts/images\`, \`artifacts/videos\`
- Target format: ${width}x${height}, ${fps}fps, ${duration}s
- Audio mode: \`${audioMode}\`
${consumerNote}
---

## Commands

Run from \`hyperframes/\`:

\`\`\`bash
npm install
npm run check
npm run render
\`\`\`

Run \`npm run audio\` only after \`audio_mode=generate\` is confirmed and a generated audio script exists.

---

## Rules

- Use \`$hyperframes\` for composition and motion implementation.
- Use \`$atmos-audio-gen\` only when audio mode resolves to \`generate\`.
- Keep generated outputs under \`artifacts/\`.
- Copy app deployment files from artifacts into the consuming app; apps must not depend on \`marketing/\` at runtime.
- Do not create \`renders/\` or \`exports/\` directories by default.
`;
}

function designTemplate(projectName) {
  return `# ${projectName} Design

## Style Contract

Follow \`$atmos-video-gen\` Style Contract.

## Visual Direction

- Simple, premium, product-led software motion.
- Restrained graphite base with blue/green accents and limited amber highlights.
- Product screenshots and logos keep original colors.
- No stale logos, rainbow AI palette, decorative blobs, noisy particles, or graywashed product media.

## Typography

Use clean developer-tool typography. Keep text readable at final video resolution.

## Motion

Use varied choreography across scenes. Do not repeat the same fade/slide pattern for every scene.
`;
}

function scriptTemplate(projectName, duration, audioMode) {
  return `# ${projectName} Script

## Overview

- Duration: ${duration}s
- Audio mode: ${audioMode}

## Scene Plan

Replace this with a scene table before authoring \`index.html\`.

| Scene | Time | Purpose | Visual | Copy | Motion |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.0s | Hook | Product/brand moment | TBD | TBD |
| 2 | TBD | Feature value | Product detail | TBD | TBD |
| 3 | TBD | Workflow proof | UI sequence | TBD | TBD |
| 4 | TBD | CTA | URL/GitHub if relevant | TBD | TBD |

## Audio Cues

If audio mode is \`generate\`, define rough cue timings here before using \`$atmos-audio-gen\`.
`;
}

function packageJson(projectName) {
  return `${JSON.stringify(
    {
      name: `@atmos/creative-${projectName}`,
      private: true,
      type: "module",
      scripts: {
        "sync:runtime": "node scripts/sync-runtime-assets.mjs",
        dev: "npm run sync:runtime && npx --yes hyperframes@0.6.118 preview",
        lint: "npm run sync:runtime && npx --yes hyperframes@0.6.118 lint",
        validate: "npm run sync:runtime && npx --yes hyperframes@0.6.118 validate",
        inspect: "npm run sync:runtime && npx --yes hyperframes@0.6.118 inspect",
        "check:scripts":
          "node --check scripts/sync-runtime-assets.mjs && node --check scripts/render-video.mjs",
        check: "npm run lint && npm run check:scripts",
        "check:full": "npm run lint && npm run validate && npm run inspect",
        render: "node scripts/render-video.mjs",
      },
      devDependencies: {
        gsap: "^3.15.0",
        playwright: "^1.61.0",
      },
    },
    null,
    2,
  )}\n`;
}

function hyperframesJson() {
  return `${JSON.stringify(
    {
      $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
      registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    },
    null,
    2,
  )}\n`;
}

function indexHtml({ projectName, width, height, duration }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <style>
      body {
        margin: 0;
        background: #101214;
      }

      [data-composition-id="main"] {
        position: relative;
        overflow: hidden;
        width: ${width}px;
        height: ${height}px;
        color: #f4f7f4;
        background: #101214;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .stage {
        box-sizing: border-box;
        display: flex;
        height: 100%;
        width: 100%;
        flex-direction: column;
        justify-content: center;
        gap: 28px;
        padding: 120px 150px;
      }

      .kicker {
        color: #78a6ff;
        font-size: 24px;
        letter-spacing: 0;
      }

      .title {
        max-width: 1180px;
        font-size: 82px;
        font-weight: 680;
        line-height: 0.98;
        letter-spacing: 0;
      }

      .body {
        max-width: 880px;
        color: #b7c2bd;
        font-size: 32px;
        line-height: 1.32;
        letter-spacing: 0;
      }
    </style>
  </head>
  <body>
    <div data-composition-id="main" data-width="${width}" data-height="${height}" data-duration="${duration}">
      <main class="stage">
        <div class="kicker">ATMOS</div>
        <div class="title">Replace this scaffold with the real product story.</div>
        <div class="body">Use $hyperframes for composition and follow the project DESIGN.md and SCRIPT.md.</div>
      </main>
    </div>
    <script src="assets/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.from(".kicker", { y: 20, opacity: 0, duration: 0.45, ease: "power2.out" }, 0.2);
      tl.from(".title", { y: 44, opacity: 0, duration: 0.7, ease: "expo.out" }, 0.38);
      tl.from(".body", { y: 30, opacity: 0, duration: 0.55, ease: "power3.out" }, 0.72);
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
}

function syncRuntimeAssetsScript() {
  return `import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const hyperframesDir = path.resolve(path.dirname(__filename), "..");
const gsapSourcePath = path.join(hyperframesDir, "node_modules/gsap/dist/gsap.min.js");
const gsapAssetPath = path.join(hyperframesDir, "assets/gsap.min.js");

export async function syncRuntimeAssets() {
  await fs.mkdir(path.dirname(gsapAssetPath), { recursive: true });
  try {
    await fs.copyFile(gsapSourcePath, gsapAssetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Missing GSAP runtime. Run npm install before previewing or rendering.");
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    await syncRuntimeAssets();
    console.log("synced assets/gsap.min.js");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
`;
}

function renderScript({ projectName, width, height, fps, duration, consumer }) {
  const aspect = aspectSlug(width, height);
  const videoName = `${projectName}-${aspect}-${height}p.mp4`;
  const posterName = `${projectName}-${aspect}-${height}p-poster.jpg`;
  const soundtrackName = `${projectName}-soundtrack.wav`;
  const landingTarget =
    consumer === "landing"
      ? `\n  {\n    name: "landing public",\n    video: path.join(repoRoot, "apps/landing/public/videos/${projectName}.mp4"),\n    poster: path.join(repoRoot, "apps/landing/public/videos/${projectName}-poster.jpg"),\n  },`
      : "";

  return `import { spawn } from "node:child_process";
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
const outputPath = path.join(projectDir, "artifacts/videos/${videoName}");
const posterPath = path.join(projectDir, "artifacts/images/${posterName}");
const musicPath = path.join(projectDir, "artifacts/audio/${soundtrackName}");
const consumerTargets = [${landingTarget}
];

const width = ${width};
const height = ${height};
const fps = ${fps};
const durationSeconds = ${duration};
const totalFrames = durationSeconds * fps;
const posterFrame = Math.max(1, Math.min(totalFrames, Math.round(fps * 1.2)));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(\`\${command} exited with code \${code}\`));
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

    const file = path.join(framesDir, \`frame-\${String(frame + 1).padStart(4, "0")}.jpg\`);
    await page.screenshot({
      path: file,
      type: "jpeg",
      quality: 95,
      clip: { x: 0, y: 0, width, height },
    });

    if (frame % fps === 0) {
      console.log(\`captured \${String(frame).padStart(3, " ")} / \${totalFrames}\`);
    }
  }

  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
}

async function encodeVideo() {
  await fs.copyFile(path.join(framesDir, \`frame-\${String(posterFrame).padStart(4, "0")}.jpg\`), posterPath);
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
      \`afade=t=in:st=0:d=1.2,afade=t=out:st=\${Math.max(0, durationSeconds - 1.8)}:d=1.8,alimiter=limit=0.86\`,
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
    console.log(\`synced \${target.name} video \${target.video}\`);
    console.log(\`synced \${target.name} poster \${target.poster}\`);
  }
}

try {
  await captureFrames();
  await encodeVideo();
  await syncConsumerTargets();
  await fs.rm(framesDir, { recursive: true, force: true });
  console.log(\`wrote \${outputPath}\`);
  console.log(\`wrote \${posterPath}\`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
`;
}

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(options.root ?? process.cwd());
const projectDir = path.join(root, "marketing/creative/projects", options.projectName);
const hyperframesDir = path.join(projectDir, "hyperframes");

await fs.mkdir(path.join(projectDir, "artifacts/audio"), { recursive: true });
await fs.mkdir(path.join(projectDir, "artifacts/images"), { recursive: true });
await fs.mkdir(path.join(projectDir, "artifacts/videos"), { recursive: true });
await fs.mkdir(path.join(projectDir, "source"), { recursive: true });
await fs.mkdir(path.join(hyperframesDir, "scripts"), { recursive: true });
await fs.mkdir(path.join(hyperframesDir, "assets/audio"), { recursive: true });

await writeFileOnce(
  path.join(projectDir, "AGENTS.md"),
  projectAgents(options),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, ".gitignore"),
  "node_modules/\n.render-frames/\nassets/audio/*.wav\nassets/gsap.min.js\n",
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "DESIGN.md"),
  designTemplate(options.projectName),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "SCRIPT.md"),
  scriptTemplate(options.projectName, options.duration, options.audioMode),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "package.json"),
  packageJson(options.projectName),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "hyperframes.json"),
  hyperframesJson(),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "index.html"),
  indexHtml(options),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "scripts/render-video.mjs"),
  renderScript(options),
  options.force,
);
await writeFileOnce(
  path.join(hyperframesDir, "scripts/sync-runtime-assets.mjs"),
  syncRuntimeAssetsScript(),
  options.force,
);

console.log(`scaffolded ${projectDir}`);
