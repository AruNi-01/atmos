/**
 * Replace the DMG `/Applications` symlink with a Finder alias that uses
 * resources/dmg/applications-folder.png as its icon.
 *
 * macOS 26 leaves a symlink well empty; an alias can carry a custom icon.
 *
 *   bun scripts/stamp-dmg-applications-alias.ts [path/to/Atmos.dmg]
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLICATIONS_PNG = join(
  appRoot,
  "resources/dmg/applications-folder.png",
);

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: process.env,
  });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  if ((r.status ?? 1) !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${r.status}): ${stderr || stdout}`,
    );
  }
  return stdout;
}

function detachVolume(volumePath: string): void {
  spawnSync("hdiutil", ["detach", volumePath, "-force"], {
    encoding: "utf8",
    env: process.env,
  });
}

function attachRw(dmgPath: string): string {
  const stdout = run("hdiutil", [
    "attach",
    "-readwrite",
    "-nobrowse",
    "-noverify",
    dmgPath,
  ]);
  const match = stdout.match(/\s+(\/Volumes\/[^\s]+)\s*$/m);
  if (!match?.[1]) {
    throw new Error(`could not parse mount point from:\n${stdout}`);
  }
  return match[1];
}

function setIcon(filePath: string, pngPath: string): void {
  const script = `
ObjC.import("AppKit");
const img = $.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(pngPath)});
if (!img || img.isNil() || img.size.width === 0) {
  throw new Error("failed to load Applications folder PNG");
}
const ok = $.NSWorkspace.sharedWorkspace.setIconForFileOptions(
  img,
  ${JSON.stringify(filePath)},
  0,
);
if (!ok) throw new Error("NSWorkspace.setIcon returned false");
`;
  run("osascript", ["-l", "JavaScript", "-e", script]);
}

function replaceSymlinkWithAlias(volumePath: string): void {
  const linkPath = join(volumePath, "Applications");
  rmSync(linkPath, { force: true });
  const escapedVolume = volumePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  run("osascript", [
    "-e",
    `tell application "Finder"
      set a to make alias file to POSIX file "/Applications" at POSIX file "${escapedVolume}"
      set name of a to "Applications"
    end tell`,
  ]);
  if (!existsSync(linkPath)) {
    throw new Error(`Finder alias was not created at ${linkPath}`);
  }
  if (!existsSync(APPLICATIONS_PNG)) {
    throw new Error(`missing ${APPLICATIONS_PNG}`);
  }
  setIcon(linkPath, APPLICATIONS_PNG);
}

export function stampDmgApplicationsAlias(dmgPath: string): void {
  if (process.platform !== "darwin") {
    throw new Error("stamping a DMG Applications alias requires macOS");
  }
  if (!existsSync(dmgPath)) {
    throw new Error(`missing dmg: ${dmgPath}`);
  }
  detachVolume("/Volumes/Atmos");
  const work = mkdtempSync(join(tmpdir(), "atmos-dmg-alias-"));
  const rw = join(work, "rw.dmg");
  const out = join(work, "out.dmg");
  try {
    run("hdiutil", ["convert", dmgPath, "-format", "UDRW", "-o", rw]);
    const volume = attachRw(rw);
    try {
      replaceSymlinkWithAlias(volume);
    } finally {
      detachVolume(volume);
    }
    run("hdiutil", [
      "convert",
      rw,
      "-format",
      "UDZO",
      "-imagekey",
      "zlib-level=9",
      "-o",
      out,
    ]);
    renameSync(out, dmgPath);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`[dmg-alias] Applications alias + folder icon stamped: ${dmgPath}`);
}

function main(): void {
  const dmg = process.argv[2] ?? join(appRoot, "release", "Atmos.dmg");
  stampDmgApplicationsAlias(dmg);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
