/**
 * Standalone dual-shift helper process entry.
 *
 * Spawned as:
 *   ELECTRON_RUN_AS_NODE=1 /path/to/Atmos dist/shift-helper-main.js
 *
 * Same executable path as Atmos → same Accessibility TCC entry.
 * Separate process → not frozen when the Electron GUI is backgrounded.
 *
 * Protocol: NDJSON lines on stdout
 *   {"t":"ready","ax":true}
 *   {"t":"edge","side":"left"|"right","down":bool,"keycode":n,"n":count}
 *   {"t":"chord"}
 *   {"t":"error","msg":"..."}
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function emit(obj: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function dylibPath(): string | null {
  const name = "libatmos_appshot_shift.dylib";
  const candidates: string[] = [];
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, "bin", name));
  }
  // Packaged: …/Atmos.app/Contents/MacOS/Atmos → Resources/bin
  try {
    const execDir = dirname(process.execPath);
    candidates.push(join(execDir, "../Resources/bin", name));
    candidates.push(join(execDir, "resources/bin", name));
  } catch {
    /* ignore */
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "../resources/bin", name));
    candidates.push(join(here, "../../resources/bin", name));
  } catch {
    /* ignore */
  }
  candidates.push(join(process.cwd(), "resources/bin", name));
  candidates.push(
    join(process.cwd(), "apps/desktop-electron/resources/bin", name),
  );
  return candidates.find((p) => existsSync(p)) ?? null;
}

function requireKoffi(): typeof import("koffi") {
  const roots: string[] = [];
  if (typeof process.resourcesPath === "string") {
    roots.push(join(process.resourcesPath, "app.asar.unpacked"));
    roots.push(process.resourcesPath);
  }
  try {
    const execDir = dirname(process.execPath);
    roots.push(join(execDir, "../Resources/app.asar.unpacked"));
  } catch {
    /* ignore */
  }
  roots.push(process.cwd());
  for (const root of roots) {
    for (const entry of [
      join(root, "node_modules", "koffi", "package.json"),
      join(root, "package.json"),
    ]) {
      try {
        if (!existsSync(entry)) continue;
        return createRequire(entry)("koffi");
      } catch {
        /* try next */
      }
    }
  }
  return createRequire(import.meta.url)("koffi");
}

function main(): void {
  if (process.platform !== "darwin") {
    emit({ t: "error", msg: "macOS only" });
    process.exit(1);
  }

  const dylib = dylibPath();
  if (!dylib) {
    emit({ t: "error", msg: "libatmos_appshot_shift.dylib not found" });
    process.exit(2);
  }

  const koffi = requireKoffi();
  const lib = koffi.load(dylib);
  const start = lib.func("atmos_appshot_shift_start", "int", []);
  const stop = lib.func("atmos_appshot_shift_stop", "void", []);
  const takeChord = lib.func("atmos_appshot_shift_take_chord", "int", []);
  const status = lib.func("atmos_appshot_shift_status", "int", []);
  const axTrusted = lib.func("atmos_appshot_shift_ax_trusted", "int", []);
  const lastEdge = lib.func("atmos_appshot_shift_last_edge", "void", [
    "int *",
    "int *",
    "int *",
    "int *",
  ]);

  const ax = axTrusted() === 1;
  emit({ t: "boot", dylib, ax });

  const rc = start();
  if (rc !== 0) {
    emit({
      t: "error",
      msg: `native start failed rc=${rc}; grant Accessibility to Atmos`,
    });
    process.exit(3);
  }

  // Wait ready
  let st = status();
  const until = Date.now() + 1000;
  while (st === 1 && Date.now() < until) {
    const spin = Date.now() + 10;
    while (Date.now() < spin) {
      /* yield */
    }
    st = status();
  }
  if (st !== 2) {
    emit({ t: "error", msg: `native status=${st} (need Accessibility)` });
    stop();
    process.exit(4);
  }

  emit({ t: "ready", ax });

  const sideBuf = Buffer.alloc(4);
  const downBuf = Buffer.alloc(4);
  const keycodeBuf = Buffer.alloc(4);
  const edgeCountBuf = Buffer.alloc(4);
  let lastEdgeN = 0;

  const timer = setInterval(() => {
    try {
      lastEdge(sideBuf, downBuf, keycodeBuf, edgeCountBuf);
      const n = edgeCountBuf.readInt32LE(0);
      if (n !== lastEdgeN) {
        lastEdgeN = n;
        const sideN = sideBuf.readInt32LE(0);
        emit({
          t: "edge",
          side: sideN === 1 ? "left" : sideN === 2 ? "right" : "?",
          down: downBuf.readInt32LE(0) === 1,
          keycode: keycodeBuf.readInt32LE(0),
          n,
        });
      }
      const chords = takeChord();
      for (let i = 0; i < chords; i++) {
        emit({ t: "chord" });
      }
    } catch (e) {
      emit({
        t: "error",
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }, 16);

  const shutdown = () => {
    clearInterval(timer);
    try {
      stop();
    } catch {
      /* ignore */
    }
    emit({ t: "exit" });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  // Keep event loop alive (do NOT unref the timer).
}

try {
  main();
} catch (e) {
  emit({ t: "error", msg: e instanceof Error ? e.message : String(e) });
  process.exit(1);
}
