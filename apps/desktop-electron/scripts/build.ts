/**
 * Bundle main + preload with esbuild (TypeScript → dist/).
 */
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

const shared: esbuild.BuildOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: [join(root, "src/main.ts")],
    outfile: join(dist, "main.js"),
    banner: {
      // Allow __dirname-like resolution when needed via import.meta
      js: "",
    },
  }),
  // First-party app preload (main / secondary windows use sandbox:false).
  esbuild.build({
    ...shared,
    entryPoints: [join(root, "src/preload.ts")],
    outfile: join(dist, "preload.js"),
  }),
  // Untrusted preview surfaces may use sandbox:true — Electron sandboxed
  // preloads require CommonJS (`require("electron")`), not ESM import.
  // Use .cjs so package.json "type":"module" does not force ESM load.
  esbuild.build({
    ...shared,
    format: "cjs",
    entryPoints: [join(root, "src/preview/preview-preload.ts")],
    outfile: join(dist, "preview-preload.cjs"),
  }),
]);

console.log(
  "[build] dist/main.js, dist/preload.js, dist/preview-preload.cjs",
);
