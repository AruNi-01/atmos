import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  containedDest,
  coverDest,
  isVisibleInClip,
  mapInnerRectToDest,
  shouldKeepSnapPreviewNode,
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

  it("covers the card without letterbox bars", () => {
    const box = coverDest(1600, 1000, 136, 92);
    expect(box.y).toBe(0);
    expect(box.h).toBe(92);
    expect(box.w).toBeCloseTo(147.2);
    expect(box.x).toBeCloseTo(-5.6);
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

  it("keeps the capture root so display-contents wrappers are not dropped", () => {
    const root = {} as HTMLElement;
    expect(shouldKeepSnapPreviewNode(root, root)).toBe(true);
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
    expect(thumb).toContain("burst: true");
    expect(thumb).toContain("width: outW");
    expect(thumb).toContain("queryCenterWorkArea");
    expect(thumb).toContain("data-center-stage-body");
    expect(thumb).toContain("opaqueBackground");
    expect(thumb).toContain("coverDest");
    expect(thumb).toContain("shouldKeepSnapPreviewNode");
    expect(thumb).toContain("isCheapHiddenPane");
    expect(thumb).toContain("isSkippedPreviewNode");
    expect(thumb).toContain("isVisibleInClip");
    expect(thumb).not.toContain("rect.width <= 1");
    expect(thumb).not.toContain("window.scrollX");
    expect(thumb).not.toContain("filterMode");
    expect(thumb).toContain("paintXtermBufferInto");
    expect(thumb).toContain("iframe");
    expect(thumb).toContain("webview");
    expect(thumb).not.toContain("document.readyState");
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
    expect(thumb).toContain("frame.isConnected");
    expect(switchSrc).toContain("await rememberMountedThumbnails(hostId)");
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
    const rememberAt = switchSrc.indexOf("async function rememberMountedThumbnails");
    const rememberBody = switchSrc.slice(
      rememberAt,
      switchSrc.indexOf("export async function captureActiveCenterSpaceThumbnail"),
    );
    expect(rememberBody).toContain("invalidate: true");
    expect(rememberBody).toContain("snapshotMountedCenterSpaceThumbnails");
  });
});
