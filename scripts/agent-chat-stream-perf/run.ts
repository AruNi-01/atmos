/**
 * Drive the Agent Chat Chromium bench.
 * Run from repo root: bun scripts/agent-chat-stream-perf/run.ts
 *
 * This directory is outside apps/web, so Next typecheck / production build
 * never see these files.
 */
import { chromium } from "../../e2e/node_modules/@playwright/test/index.mjs";
import { mkdirSync, writeFileSync, copyFileSync, existsSync, symlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist } from "./public-file";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const outDir = process.env.ATMOS_STREAM_PERF_OUTDIR ?? join(here, "tmp");

function ensureWebNodeModules(): void {
  const link = join(here, "node_modules");
  const target = join(here, "../../apps/web/node_modules");
  if (existsSync(link) || !existsSync(target)) return;
  symlinkSync(target, link);
}

async function bunBuild(): Promise<void> {
  mkdirSync(dist, { recursive: true });
  ensureWebNodeModules();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "bun",
      [
        "build",
        join(here, "bench-app.tsx"),
        "--outfile",
        join(dist, "bench.js"),
        "--target",
        "browser",
      ],
      { stdio: "inherit", cwd: here },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bun build exited ${code}`));
    });
  });
  copyFileSync(join(here, "index.html"), join(dist, "index.html"));
}

async function measure(url: string, mode: "main" | "branch") {
  const chromePath = process.env.ATMOS_STREAM_PERF_CHROME;
  const browser = await chromium.launch({
    ...(chromePath ? { executablePath: chromePath } : {}),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 800 } });
    await page.goto(`${url}/?mode=${mode}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      Boolean((window as unknown as { __ATMOS_STREAM_BENCH?: unknown }).__ATMOS_STREAM_BENCH),
    );
    await page.waitForTimeout(400);
    const scroll = await page.evaluate(async () => {
      const bench = (
        window as unknown as { __ATMOS_STREAM_BENCH: { runScroll: () => Promise<unknown> } }
      ).__ATMOS_STREAM_BENCH;
      return bench.runScroll();
    });
    const tokens = await page.evaluate(async () => {
      const bench = (
        window as unknown as { __ATMOS_STREAM_BENCH: { runTokens: () => Promise<unknown> } }
      ).__ATMOS_STREAM_BENCH;
      return bench.runTokens();
    });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    return { mode, userAgent, scroll, tokens };
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  await bunBuild();
  const server = await serveDist(dist);
  const chromePath = process.env.ATMOS_STREAM_PERF_CHROME;
  try {
    const before = await measure(server.url, "main");
    const after = await measure(server.url, "branch");
    const payload = {
      measured_at: new Date().toISOString(),
      environment: {
        browser: chromePath
          ? "Google Chrome headless via Playwright"
          : "Playwright managed Chromium",
        executable: chromePath ?? "playwright-chromium",
        user_agent_after: after.userAgent,
        os: process.platform,
        notes:
          "Standalone product-shaped virtual list (same overscan/estimates/measureElement/56ms cadence/display buffer). Not the full Next AgentChatMessageView (no next-intl, Streamdown, or tool chrome).",
      },
      fixture: {
        turns: 500,
        tools_per_turn: 8,
        tokens_per_answer: 40,
      },
      method: {
        scroll_fps:
          "rAF timestamps while programmatically scrolling the virtual list from top to bottom over 2000ms",
        per_token:
          "React.Profiler onRender actualDuration while appending 40 tokens. main = unbatched per-token commits (not production's 150ms client buffer); branch = 56ms snapshot flush + useSmoothStreamText on the last open text",
      },
      before_main_protocol: before,
      after_branch_protocol: after,
    };
    const jsonPath = join(outDir, "agent-chat-chromium-stream-perf.json");
    writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(JSON.stringify(payload, null, 2));
    console.log(`wrote ${jsonPath}`);
  } finally {
    await server.close();
  }
}

await main();
