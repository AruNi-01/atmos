import { cpSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "../..");
const docsDir = join(rootDir, "apps/docs");
const docsOutDir = join(docsDir, "out");
const proxyFile = join(docsDir, "src/proxy.ts");
const proxyBackupFile = join(docsDir, "src/_proxy_pages_backup.ts");
const llmsMdxRouteDir = join(docsDir, "src/app/llms.mdx");
const llmsMdxRouteBackupDir = join(docsDir, ".llms_mdx_pages_backup");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: rootDir,
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    const error = new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}`,
    );
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

function ensurePagesHeaders() {
  writeFileSync(
    join(docsOutDir, "_headers"),
    `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`,
    "utf8",
  );
}

function copyDefaultLocalePages() {
  const defaultLocaleDir = join(docsOutDir, "en");
  if (!existsSync(defaultLocaleDir)) {
    return;
  }

  for (const entry of readdirSync(defaultLocaleDir)) {
    cpSync(join(defaultLocaleDir, entry), join(docsOutDir, entry), {
      recursive: true,
      force: true,
    });
  }
}

function ensurePagesRedirects() {
  writeFileSync(
    join(docsOutDir, "_redirects"),
    `/docs /introduction 302
/docs/* /:splat 302
/zh/docs /zh/introduction 302
/zh/docs/* /zh/:splat 302
/zh /zh/introduction 302
/ /introduction 302
`,
    "utf8",
  );
}

let exitCode = 0;

try {
  rmSync(docsOutDir, { recursive: true, force: true });
  if (existsSync(proxyFile)) {
    renameSync(proxyFile, proxyBackupFile);
  }
  if (existsSync(llmsMdxRouteDir)) {
    renameSync(llmsMdxRouteDir, llmsMdxRouteBackupDir);
  }

  run("bun", ["--filter", "docs", "build"], {
    env: {
      ...process.env,
      BUILD_TARGET: "pages",
      NEXT_PUBLIC_BUILD_TARGET: "pages",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "https://docs.atmos.land",
    },
  });

  copyDefaultLocalePages();
  ensurePagesHeaders();
  ensurePagesRedirects();
} catch (error) {
  console.error(error.message ?? error);
  exitCode = error?.exitCode ?? 1;
} finally {
  if (existsSync(llmsMdxRouteBackupDir)) {
    renameSync(llmsMdxRouteBackupDir, llmsMdxRouteDir);
  }
  if (existsSync(proxyBackupFile)) {
    renameSync(proxyBackupFile, proxyFile);
  }
}

if (exitCode !== 0) {
  process.exit(exitCode);
}
