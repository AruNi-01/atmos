import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = resolve(import.meta.dirname, "../..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: rootDir,
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("bun", ["--filter", "web", "build"], {
  env: {
    ...process.env,
    BUILD_TARGET: "desktop",
  },
});

let targetTriple = process.env.TARGET_TRIPLE;
if (!targetTriple) {
  const rustc = spawnSync("rustc", ["-vV"], {
    cwd: rootDir,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });

  if (rustc.status !== 0) {
    process.exit(rustc.status ?? 1);
  }

  const hostLine = rustc.stdout.split("\n").find((line) => line.startsWith("host:"));

  if (!hostLine) {
    console.error("Unable to detect rust host triple from `rustc -vV`.");
    process.exit(1);
  }

  targetTriple = hostLine.replace("host:", "").trim();
}

run("cargo", ["build", "--release", "--bin", "api", "--target", targetTriple]);

const binExt = targetTriple.includes("windows") ? ".exe" : "";
const binariesDir = join(rootDir, "apps/desktop/src-tauri/binaries");
mkdirSync(binariesDir, { recursive: true });

const fromSidecar = join(rootDir, `target/${targetTriple}/release/api${binExt}`);
const toSidecar = join(binariesDir, `api-${targetTriple}${binExt}`);
cpSync(fromSidecar, toSidecar);
console.log(`Prepared sidecar: ${toSidecar}`);

const webOut = join(rootDir, "apps/web/out");
const sidecarWebOut = join(binariesDir, "web-out");

if (existsSync(webOut)) {
  const indexHtmlPath = join(webOut, "index.html");
  if (!existsSync(indexHtmlPath)) {
    // Generate a simple redirect to the default locale for Tauri entry point
    writeFileSync(
      indexHtmlPath,
      `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url=/en/" />
    <script>window.location.replace('/en/');</script>
  </head>
  <body></body>
</html>`
    );
  }
  
  rmSync(sidecarWebOut, { recursive: true, force: true });
  cpSync(webOut, sidecarWebOut, { recursive: true });
  console.log(`Copied web static export to: ${sidecarWebOut}`);
} else {
  console.warn(`Warning: ${webOut} not found, skipping web static copy`);
}
