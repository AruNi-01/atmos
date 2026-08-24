import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  containedDest,
  isVisibleInClip,
  mapInnerRectToDest,
} from "@/app-shell/center-space/center-space-thumbnail";

const dir = join(import.meta.dir, "..");

describe("center space thumbnail mapping", () => {
  it("fits the frame into the card without cropping", () => {
    const box = containedDest(1600, 1000, 136, 92);
    expect(box.x).toBe(0);
    expect(box.w).toBe(136);
    expect(box.h).toBeCloseTo(85);
    expect(box.y).toBeCloseTo(3.5);
  });

  it("maps a canvas rect into a mosaic cell", () => {
    expect(
      mapInnerRectToDest(
        { left: 100, top: 40, width: 200, height: 100 },
        { left: 100, top: 40, width: 400, height: 200 },
        { x: 10, y: 5, w: 80, h: 40 },
      ),
    ).toEqual({ x: 10, y: 5, w: 40, h: 20 });
  });

  it("keeps only boxes that overlap the visible clip", () => {
    const clip = { left: 0, top: 0, right: 200, bottom: 100 };
    expect(
      isVisibleInClip({ left: 10, top: 10, right: 40, bottom: 40 }, clip),
    ).toBe(true);
    expect(
      isVisibleInClip({ left: 0, top: 2000, right: 200, bottom: 2040 }, clip),
    ).toBe(false);
  });

  it("fills the cell when the pane has no layout size", () => {
    expect(
      mapInnerRectToDest(
        { left: 0, top: 0, width: 0, height: 0 },
        { left: 0, top: 0, width: 0, height: 0 },
        { x: 2, y: 3, w: 70, h: 40 },
      ),
    ).toEqual({ x: 2, y: 3, w: 70, h: 40 });
  });

  it("captures the live frame with snapdom instead of html2canvas", () => {
    const thumb = readFileSync(
      join(dir, "center-space/center-space-thumbnail.ts"),
      "utf8",
    );
    expect(thumb).toContain('@zumer/snapdom');
    expect(thumb).toContain("snapdom.toCanvas");
    expect(thumb).toContain("clip:");
    expect(thumb).toContain('filterMode: "remove"');
    expect(thumb).toContain("isVisibleInClip");
    expect(thumb).toContain("paintXtermBufferInto");
    expect(thumb).toContain("excludeMode");
    expect(thumb).toContain("iframe");
    expect(thumb).toContain("webview");
    expect(thumb).not.toContain("html2canvas");
    expect(thumb).not.toContain("use-react-screenshot");
    expect(thumb).not.toContain("react-screen-capture");
    expect(thumb).not.toContain("html-to-image");
    expect(thumb).not.toContain("paintDomPreview");
    const preview = readFileSync(
      join(dir, "center-space/CenterSpacePreview.tsx"),
      "utf8",
    );
    expect(preview).toContain("paintCenterSpaceTerminalOverlay");
  });

  it("snapshots the outgoing space before the slide so hidden frames cannot overwrite it", () => {
    const switchSrc = readFileSync(
      join(dir, "center-space/center-space-switch.ts"),
      "utf8",
    );
    const thumb = readFileSync(
      join(dir, "center-space/center-space-thumbnail.ts"),
      "utf8",
    );
    expect(thumb).toContain("isActiveCaptureFrame");
    expect(thumb).toContain('data-tier") === "active"');
    const createAt = switchSrc.indexOf("export async function openNewCenterSpace");
    const switchAt = switchSrc.indexOf("export async function switchCenterSpace");
    const createBody = switchSrc.slice(createAt, switchAt);
    const switchBody = switchSrc.slice(switchAt, switchSrc.indexOf("export async function deleteCenterSpace"));
    expect(createBody).toContain("await rememberMountedThumbnails(hostId)");
    expect(createBody).not.toContain("captureActiveCenterSpaceThumbnail");
    expect(switchBody).toContain("await rememberMountedThumbnails(hostId)");
    expect(createBody.indexOf("await rememberMountedThumbnails(hostId)")).toBeLessThan(
      createBody.indexOf("runCenterSpaceSlide"),
    );
    expect(switchBody.indexOf("await rememberMountedThumbnails(hostId)")).toBeLessThan(
      switchBody.indexOf("runCenterSpaceSlide"),
    );
    expect(createBody.indexOf("await rememberMountedThumbnails(hostId)")).toBeLessThan(
      createBody.indexOf("invalidateCenterSpaceThumbnailCapture()"),
    );
  });
});
