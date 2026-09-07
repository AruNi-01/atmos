import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Preview UI lives in `<pkg>/dist/ui` during `bun run`, and next to the
 * compiled binary after `just pack-serve-emu` (`ui/index.html`).
 * `bun --compile` resolves `import.meta.url` under `/$bunfs/`, so the packed
 * path must follow `process.execPath` the same way scrcpy-server does.
 */
export function resolveUiDir(): string {
  const exec = process.execPath;
  if (exec && !exec.includes("/$bunfs/")) {
    const packed = join(dirname(exec), "ui");
    if (existsSync(join(packed, "index.html"))) return packed;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "dist", "ui");
}
