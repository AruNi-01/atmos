import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CENTER_SPACE_ID,
  DEFAULT_CENTER_SPACE_NAME,
  centerSpaceSlideDirection,
  neighborSpaceIdAfterDelete,
  omitCenterSpaceThumbnails,
} from "@/app-shell/center-space/center-space";
import { CENTER_SPACE_SLIDE_MS } from "@/app-shell/center-space/center-space-slide";
import {
  CENTER_SPACE_FAN_MS,
  centerSpaceFanCssVars,
  centerSpaceFanPose,
} from "@/app-shell/center-space/center-space-fan";

const dir = join(import.meta.dir, "..");

describe("center space switcher open path", () => {
  it("starts a cheap preview on hover and never waits for it before fanning", () => {
    const switcher = readFileSync(
      join(dir, "center-space/CenterSpaceSwitcher.tsx"),
      "utf8",
    );
    expect(switcher).toContain("onPointerEnter={handlePointerEnter}");
    expect(switcher).toContain("onPointerLeave={handlePointerLeave}");
    expect(switcher).toContain("onFocus={handlePointerEnter}");
    expect(switcher).toContain("schedulePreview");
    expect(switcher).toContain("requestIdleCallback");
    expect(switcher).toContain("void ensurePreview()");
    expect(switcher).not.toContain("await ensurePreview()");
    expect(switcher).toContain("refreshActiveCenterSpacePreview");
    const enterAt = switcher.indexOf("const handlePointerEnter");
    const toggleAt = switcher.indexOf("const handleToggleOpen");
    const enterBody = switcher.slice(enterAt, toggleAt);
    expect(enterBody).toContain("schedulePreview()");
    expect(enterBody).not.toContain("ensurePreview()");
    expect(switcher).not.toContain("motion/react");
    expect(switcher).not.toContain("captureCurrentPreview");
    const openAt = switcher.indexOf("setOpen(true)", toggleAt);
    const captureAt = switcher.indexOf("void ensurePreview()", toggleAt);
    expect(openAt).toBeGreaterThan(toggleAt);
    expect(captureAt).toBeGreaterThan(openAt);
  });

  it("captures a small jpeg without fonts or cache-busting", () => {
    const thumb = readFileSync(
      join(dir, "center-space/center-space-thumbnail.ts"),
      "utf8",
    );
    expect(thumb).toContain("toJpeg");
    expect(thumb).toContain("yieldToIdle");
    expect(thumb).toContain("includeStyleProperties");
    expect(thumb).toContain("data-center-panel-host");
    expect(thumb).toContain("skipFonts: true");
    expect(thumb).toContain("cacheBust: false");
    expect(thumb).toContain("THUMB_WIDTH = 96");
    expect(thumb).toContain('classList.contains("xterm")');
    expect(thumb).not.toContain("cacheBust: true");
    expect(thumb).not.toContain("THUMB_WIDTH = 280");
    expect(thumb).not.toContain("THUMB_WIDTH = 128");
  });

  it("fans with compositor transforms instead of js springs", () => {
    const css = readFileSync(join(dir, "center-space/center-space-fan.css"), "utf8");
    expect(css).toContain("translate3d(var(--fan-x), var(--fan-y), 0)");
    expect(css).toContain("will-change: transform, opacity");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(`${CENTER_SPACE_FAN_MS}ms`);
    const pose = centerSpaceFanPose(0, 3, true);
    const vars = centerSpaceFanCssVars(pose);
    expect(vars["--fan-x"]).toBe(`${pose.x}px`);
    expect(centerSpaceFanPose(1, 3, false).opacity).toBe(0);
  });

  it("crossfades the whole center card instead of per-frame push-page classes", () => {
    const switcherSrc = readFileSync(
      join(dir, "center-space/center-space-switch.ts"),
      "utf8",
    );
    expect(switcherSrc).toContain("runCenterSpaceSlide");
    expect(switcherSrc).toContain('"forward"');
    expect(switcherSrc).toContain('"back"');
    const createAt = switcherSrc.indexOf("export async function openNewCenterSpace");
    const switchAt = switcherSrc.indexOf("export async function switchCenterSpace");
    const createBody = switcherSrc.slice(createAt, switchAt);
    expect(createBody).toContain('runCenterSpaceSlide("forward"');
    expect(createBody).not.toContain("captureActiveCenterSpaceThumbnail");
    expect(switcherSrc).not.toContain("useCenterSpaceSlideStore");
    const frame = readFileSync(join(dir, "workspace-center-frame.tsx"), "utf8");
    expect(frame).not.toContain("push-page-slide-in-x");
    expect(frame).not.toContain("push-page-slide-out-x");
    const css = readFileSync(
      join(import.meta.dir, "../../app/globals.css"),
      "utf8",
    );
    expect(css).toContain("center-space-card");
    expect(css).toContain("space-zoom-out");
    expect(css).toContain("space-zoom-in");
    expect(css).toContain("scale(1.12)");
    expect(css).toContain(`${CENTER_SPACE_SLIDE_MS}ms`);
    expect(css).not.toContain("space-slide-to-left");
    expect(css).not.toContain("space-slide-from-right");
    expect(css.indexOf("::view-transition-old(*)")).toBeGreaterThan(0);
    expect(css.indexOf("::view-transition-old(center-space-card)")).toBeGreaterThan(
      css.indexOf("::view-transition-old(*)"),
    );
    const slideSrc = readFileSync(join(dir, "center-space/center-space-slide.ts"), "utf8");
    expect(slideSrc).toContain("doc.startViewTransition(update)");
    expect(slideSrc).not.toContain("return start(update)");
    const spaces = [
      { id: "main" },
      { id: "space-1" },
      { id: "space-2" },
    ];
    expect(centerSpaceSlideDirection(spaces, "main", "space-2")).toBe("forward");
    expect(centerSpaceSlideDirection(spaces, "space-2", "main")).toBe("back");
    expect(neighborSpaceIdAfterDelete(
      [
        {
          id: DEFAULT_CENTER_SPACE_ID,
          name: DEFAULT_CENTER_SPACE_NAME,
          createdAt: 1,
          updatedAt: 1,
        },
        { id: "space-1", name: "Space 1", createdAt: 1, updatedAt: 1 },
        { id: "space-2", name: "Space 2", createdAt: 1, updatedAt: 1 },
      ],
      "space-2",
    )).toBe("space-1");
  });

  it("strips jpeg data urls before durable writes", () => {
    const stripped = omitCenterSpaceThumbnails({
      "ws-1": {
        activeSpaceId: DEFAULT_CENTER_SPACE_ID,
        spaces: [
          {
            id: DEFAULT_CENTER_SPACE_ID,
            name: DEFAULT_CENTER_SPACE_NAME,
            createdAt: 1,
            updatedAt: 1,
            thumbnailDataUrl: "data:image/jpeg;base64,abc",
          },
        ],
      },
    });
    expect(stripped["ws-1"]?.spaces[0]?.thumbnailDataUrl).toBeNull();
  });
});
