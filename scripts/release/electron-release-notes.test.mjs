/**
 * Ensures production release notes never reassert Tauri as default,
 * ship a collapsed Download section, and can inject Contributors @mentions.
 * Run: bun test scripts/release/electron-release-notes.test.mjs
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDesktopContributorsSection,
  buildDesktopDownloadSection,
  defaultElectronReleaseNotes,
  ensureDesktopDownloadSection,
  ensureDesktopReleaseNotesExtras,
  formatContributorMentions,
  rankContributorLogins,
  stripDesktopContributorsSection,
  stripDesktopDownloadSection,
  FORBIDDEN_ELECTRON_NOTES_PHRASES,
} from "./electron-release-notes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Electron production release notes", () => {
  it("default stub is product-facing Atmos Desktop (no Tauri-as-default)", () => {
    const body = defaultElectronReleaseNotes(
      "2026.8.1",
      "desktop-electron-2026.8.1",
    );
    expect(body).toContain("Atmos desktop release `2026.8.1`");
    expect(body).toContain("desktop-electron-2026.8.1");
    expect(body).toContain("com.atmos.desktop");
    // Product notes should not open with a duplicate H1 (GitHub Release title is H1).
    expect(body.startsWith("# ")).toBe(false);
    for (const phrase of FORBIDDEN_ELECTRON_NOTES_PHRASES) {
      expect(body.includes(phrase)).toBe(false);
    }
  });

  it("default stub ends with collapsed Download section and real asset names", () => {
    const version = "2026.8.2-beta.1";
    const body = defaultElectronReleaseNotes(
      version,
      `desktop-electron-${version}`,
    );
    expect(body).toContain("<details>");
    expect(body).toContain("<summary><strong>Download</strong></summary>");
    expect(body).toContain("### macOS");
    expect(body).toContain("### Windows");
    expect(body).toContain("### Linux");
    expect(body).toContain(`Atmos_${version}_aarch64.dmg`);
    expect(body).toContain(`Atmos_${version}_x64.dmg`);
    expect(body).toContain(`Atmos_${version}_x64-setup.exe`);
    expect(body).toContain(`Atmos_${version}_x64.AppImage`);
    expect(body).toContain(
      `releases/download/desktop-electron-${version}/`,
    );
    // macOS first
    const macIdx = body.indexOf("### macOS");
    const winIdx = body.indexOf("### Windows");
    const linuxIdx = body.indexOf("### Linux");
    expect(macIdx).toBeGreaterThan(-1);
    expect(macIdx).toBeLessThan(winIdx);
    expect(winIdx).toBeLessThan(linuxIdx);
  });

  it("ensureDesktopDownloadSection replaces stale download links", () => {
    const old = buildDesktopDownloadSection("2026.7.1");
    const body = `Summary of the release.\n\n## New Features\n\n- Feature A\n\n${old}`;
    const next = ensureDesktopDownloadSection(body, "2026.8.2");
    expect(next).toContain("Atmos_2026.8.2_aarch64.dmg");
    expect(next).not.toContain("Atmos_2026.7.1_aarch64.dmg");
    expect((next.match(/<!-- atmos-desktop-download -->/g) || []).length).toBe(
      1,
    );
    expect((next.match(/<details>/g) || []).length).toBe(1);
  });

  it("stripDesktopDownloadSection removes bare details Download blocks", () => {
    const body = `Hello\n\n<details>\n<summary><strong>Download</strong></summary>\n\nold\n\n</details>\n`;
    const stripped = stripDesktopDownloadSection(body);
    expect(stripped).toContain("Hello");
    expect(stripped).not.toContain("<details>");
    expect(stripped).not.toContain("Download");
  });

  it("rankContributorLogins ranks by commit volume, then name; keeps bots", () => {
    expect(
      rankContributorLogins([
        "@Bob",
        "alice",
        "dependabot[bot]",
        "Alice", // 2nd alice commit
        "Bob", // 2nd bob
        "Bob", // 3rd bob
        "",
        "github-actions[bot]",
      ]),
    ).toEqual([
      "Bob", // 3
      "alice", // 2
      "dependabot[bot]", // 1
      "github-actions[bot]", // 1 (alpha after equal count)
    ]);
  });

  it("formatContributorMentions uses natural English lists", () => {
    expect(formatContributorMentions(["a"])).toBe("@a");
    expect(formatContributorMentions(["a", "b"])).toBe("@a and @b");
    expect(formatContributorMentions(["a", "b", "c"])).toBe(
      "@a, @b, and @c",
    );
  });

  it("ensureDesktopReleaseNotesExtras puts contributors before download", () => {
    // Callers pass already-ranked lists; order is preserved as given.
    const body = ensureDesktopReleaseNotesExtras(
      "Summary.\n\n## New Features\n\n- Thing\n",
      "2026.8.2",
      { contributors: ["zulu", "alice"] },
    );
    expect(body).toContain("Thanks to @zulu and @alice.");
    expect(body).toContain("<!-- atmos-desktop-contributors -->");
    const cIdx = body.indexOf("Thanks to");
    const dIdx = body.indexOf("<!-- atmos-desktop-download -->");
    expect(cIdx).toBeGreaterThan(-1);
    expect(dIdx).toBeGreaterThan(cIdx);
    // Replacing contributors should not duplicate
    const again = ensureDesktopReleaseNotesExtras(body, "2026.8.2", {
      contributors: ["alice"],
    });
    expect(again).toContain("Thanks to @alice.");
    expect(again).not.toContain("@zulu");
    expect((again.match(/Thanks to /g) || []).length).toBe(1);
  });

  it("buildDesktopContributorsSection is empty without logins", () => {
    expect(buildDesktopContributorsSection([])).toBe("");
    expect(buildDesktopContributorsSection(["dependabot[bot]"])).toContain(
      "@dependabot[bot]",
    );
  });

  it("stripDesktopContributorsSection removes marker block", () => {
    const body = `Hello\n\n${buildDesktopContributorsSection(["alice"])}\nMore`;
    // strip only removes marker-to-next-marker; trailing text may remain if after
    const withEnd = `Hello\n\n${buildDesktopContributorsSection(["alice"])}`;
    const stripped = stripDesktopContributorsSection(withEnd);
    expect(stripped).toContain("Hello");
    expect(stripped).not.toContain("@alice");
    expect(stripped).not.toContain("Thanks to");
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
