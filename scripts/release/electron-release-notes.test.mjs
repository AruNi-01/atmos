/**
 * Ensures production release notes never reassert Tauri as default.
 * Run: bun test scripts/release/electron-release-notes.test.mjs
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultElectronReleaseNotes,
  FORBIDDEN_ELECTRON_NOTES_PHRASES,
} from "./electron-release-notes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Electron production release notes", () => {
  it("default stub is product-facing Atmos Desktop (no Tauri-as-default)", () => {
    const body = defaultElectronReleaseNotes(
      "2026.8.1",
      "desktop-electron-2026.8.1",
    );
    expect(body).toContain("# Atmos Desktop 2026.8.1");
    expect(body).toContain("desktop-electron-2026.8.1");
    expect(body).toContain("com.atmos.desktop");
    for (const phrase of FORBIDDEN_ELECTRON_NOTES_PHRASES) {
      expect(body.includes(phrase)).toBe(false);
    }
  });

  it("release-desktop-electron.mjs uses shared notes helper (not inline experimental stub)", () => {
    const src = readFileSync(
      resolve(__dirname, "release-desktop-electron.mjs"),
      "utf8",
    );
    expect(src).toContain("defaultElectronReleaseNotes");
    expect(src).toContain("from \"./electron-release-notes.mjs\"");
    for (const phrase of FORBIDDEN_ELECTRON_NOTES_PHRASES) {
      expect(src.includes(phrase)).toBe(false);
    }
    expect(src.toLowerCase()).not.toContain("experimental atmos desktop");
  });

  it("existing Electron release notes files do not reassert Tauri as default", () => {
    const notesPath = resolve(
      __dirname,
      "../../releasenotes/Atmos Desktop Electron 2026.7.27-beta.1.md",
    );
    const body = readFileSync(notesPath, "utf8");
    for (const phrase of FORBIDDEN_ELECTRON_NOTES_PHRASES) {
      expect(body.includes(phrase)).toBe(false);
    }
  });
});
