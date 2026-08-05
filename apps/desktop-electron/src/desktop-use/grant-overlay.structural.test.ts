import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("desktop-use grant overlay", () => {
  it("uses Electron startDrag and never embeds third-party grant brands", () => {
    const src = readFileSync(
      join(import.meta.dir, "grant-overlay.ts"),
      "utf8",
    );
    expect(src).toContain("startDrag");
    expect(src).toContain("hostAppPath");
    expect(src.toLowerCase()).not.toContain("chatgpt");
    expect(src.toLowerCase()).not.toContain("codex");
    expect(src.toLowerCase()).not.toContain("trycua");
  });

  it("grant preload only exposes drag/close bridge", () => {
    const src = readFileSync(
      join(import.meta.dir, "grant-preload.ts"),
      "utf8",
    );
    expect(src).toContain("startDrag");
    expect(src).toContain("sendSync");
    expect(src).toContain("desktop-use-grant-drag-start");
    expect(src).toContain("desktop-use-grant-close");
  });

  it("uses dragstart not mousedown for file drag", () => {
    const src = readFileSync(
      join(import.meta.dir, "grant-overlay.ts"),
      "utf8",
    );
    expect(src).toContain("dragstart");
    expect(src).not.toContain("addEventListener('mousedown'");
  });
});
