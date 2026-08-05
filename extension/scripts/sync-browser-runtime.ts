/**
 * Copy canonical guest runtime into the extension package.
 * Source of truth: packages/shared/browser/browser-runtime.js
 *
 * Run: bun run extension/scripts/sync-browser-runtime.ts
 * (from repo root) or via package scripts that zip the extension.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(extensionRoot, "..");
const src = join(repoRoot, "packages/shared/browser/browser-runtime.js");
const dest = join(extensionRoot, "browser-runtime.js");
const manifestPath = join(extensionRoot, "manifest.json");

if (!existsSync(src)) {
  console.error(`[extension] missing source runtime: ${src}`);
  process.exit(1);
}

copyFileSync(src, dest);

// Keep EXTENSION_VERSION in shared aligned with manifest when possible.
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    version?: string;
  };
  const version = typeof manifest.version === "string" ? manifest.version : "";
  if (version) {
    let body = readFileSync(dest, "utf8");
    body = body.replace(
      /var EXTENSION_VERSION = '[^']*';/,
      `var EXTENSION_VERSION = '${version}';`,
    );
    writeFileSync(dest, body);
    // Mirror version into shared so desktop inject reports the same build id.
    let shared = readFileSync(src, "utf8");
    const nextShared = shared.replace(
      /var EXTENSION_VERSION = '[^']*';/,
      `var EXTENSION_VERSION = '${version}';`,
    );
    if (nextShared !== shared) {
      writeFileSync(src, nextShared);
      copyFileSync(src, dest);
      // re-apply version stamp after re-copy
      let body2 = readFileSync(dest, "utf8");
      body2 = body2.replace(
        /var EXTENSION_VERSION = '[^']*';/,
        `var EXTENSION_VERSION = '${version}';`,
      );
      writeFileSync(dest, body2);
    }
  }
} catch (e) {
  console.warn("[extension] version stamp skipped", e);
}

console.log(`[extension] synced browser-runtime.js from packages/shared (${src})`);
