import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readGrantSources() {
  const main = readFileSync(join(import.meta.dir, "grant-overlay.ts"), "utf8");
  const panel = readFileSync(
    join(import.meta.dir, "grant-overlay-panel.ts"),
    "utf8",
  );
  const position = readFileSync(
    join(import.meta.dir, "grant-overlay-position.ts"),
    "utf8",
  );
  return { main, panel, position, all: `${main}\n${panel}\n${position}` };
}

describe("desktop-use grant overlay", () => {
  it("uses Electron startDrag and never embeds third-party grant brands", () => {
    const { main, all: src } = readGrantSources();
    expect(main).toContain("startDrag");
    expect(src).toContain("hostAppPath");
    expect(src.toLowerCase()).not.toContain("chatgpt");
    expect(src.toLowerCase()).not.toContain("codex");
    expect(src.toLowerCase()).not.toContain("trycua");
  });

  it("grant preload exposes drag preview + close (no Finder reveal)", () => {
    const src = readFileSync(
      join(import.meta.dir, "grant-preload.ts"),
      "utf8",
    );
    expect(src).toContain("startDrag");
    expect(src).toContain("setDragPreview");
    expect(src).toContain("sendSync");
    expect(src).toContain("desktop-use-grant-drag-start");
    expect(src).toContain("desktop-use-grant-drag-preview");
    expect(src).toContain("desktop-use-grant-close");
    expect(src).not.toContain("desktop-use-grant-reveal");
    expect(src).not.toContain("reveal");
  });

  it("uses dragstart not mousedown for file drag", () => {
    const { all: src } = readGrantSources();
    expect(src).toContain("dragstart");
    expect(src).not.toContain("addEventListener('mousedown'");
  });

  it("matches in-window placement and reference UX (no chip/Finder)", () => {
    const { main, all: src } = readGrantSources();
    expect(src).not.toContain("芯片");
    expect(src).not.toMatch(/Drag the chip/i);
    expect(src).not.toContain("Finder");
    expect(src).not.toContain("desktop-use-grant-reveal");
    expect(main).toContain("getSystemSettingsWindowBounds");
    expect(main).toContain("positionInsideSettingsWindow");
    expect(src).toContain("buildDragPreview");
    expect(src).toContain("list above");
    expect(src).toContain("img-src data:");
    expect(src).toContain("resolveChipIconDataUrl");
    // Never block main with sync osascript (beach-ball / stuck hover).
    expect(src).not.toContain("execFileSync");
    expect(main).toContain("execFileAsync");
    // Fly from Atmos → System Settings while bounds resolve mid-animation.
    expect(main).toContain("flyFromAtmosToSettings");
    expect(main).toContain("getFlySourceOrigin");
    expect(src).toContain("sourceOrigin");
    expect(main).toContain("easeOutCubic");
    expect(src).toContain("grant-enter");
    // Wait for Settings bounds before committing fly end-point.
    expect(main).toContain("waitForSystemSettingsBounds");
    expect(main).toContain("BOUNDS_WAIT_MS");
    // Drag ghost must stay 1× CSS size (no devicePixelRatio inflate).
    expect(src).toMatch(/Do NOT multiply by devicePixelRatio/);
  });
});
