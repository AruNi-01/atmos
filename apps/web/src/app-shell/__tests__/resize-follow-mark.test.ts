import { describe, expect, test } from "bun:test";
import {
  RESIZE_FOLLOW_MARK_GAP_PX,
  RESIZE_FOLLOW_MARK_LENGTH_PX,
  RESIZE_FOLLOW_MARK_THICKNESS_PX,
  clampResizeFollowAlongPx,
  followMarkCrossOffsetPx,
  followMarkTransform,
  resizeFollowSeamAt,
  resizeFollowSeamFromGap,
  resolveResizeApproachSide,
  resolveResizeFollowMark,
} from "@/app-shell/resize-follow-mark";

const host = { left: 100, top: 50, width: 10, height: 200 };

describe("resize follow mark", () => {
  test("vertical handle uses pointer X to pick the approach side", () => {
    expect(
      resolveResizeApproachSide("vertical", { x: 101, y: 120 }, host),
    ).toBe("start");
    expect(
      resolveResizeApproachSide("vertical", { x: 108, y: 120 }, host),
    ).toBe("end");
  });

  test("horizontal handle uses pointer Y to pick the approach side", () => {
    expect(
      resolveResizeApproachSide("horizontal", { x: 140, y: 51 }, host),
    ).toBe("start");
    expect(
      resolveResizeApproachSide("horizontal", { x: 140, y: 180 }, host),
    ).toBe("end");
  });

  test("locks the approach side while the pointer travels along the handle", () => {
    const next = resolveResizeFollowMark({
      axis: "vertical",
      pointer: { x: 108, y: 160 },
      host,
      lockedSide: "start",
    });
    expect(next.side).toBe("start");
    expect(next.alongPx).toBe(110);
  });

  test("follows the pointer along the handle axis", () => {
    const vertical = resolveResizeFollowMark({
      axis: "vertical",
      pointer: { x: 101, y: 150 },
      host,
      lockedSide: null,
    });
    expect(vertical.side).toBe("start");
    expect(vertical.alongPx).toBe(100);

    const horizontal = resolveResizeFollowMark({
      axis: "horizontal",
      pointer: { x: 140, y: 51 },
      host: { left: 100, top: 50, width: 200, height: 10 },
      lockedSide: null,
    });
    expect(horizontal.side).toBe("start");
    expect(horizontal.alongPx).toBe(40);
  });

  test("clamps the mark so it stays inside the host", () => {
    expect(clampResizeFollowAlongPx(0, 200)).toBe(RESIZE_FOLLOW_MARK_LENGTH_PX / 2);
    expect(clampResizeFollowAlongPx(200, 200)).toBe(200 - RESIZE_FOLLOW_MARK_LENGTH_PX / 2);
    expect(clampResizeFollowAlongPx(100, 200)).toBe(100);
    expect(clampResizeFollowAlongPx(10, 20)).toBe(RESIZE_FOLLOW_MARK_LENGTH_PX / 2);
  });

  test("offsets the capsule from the visual border toward the approach side", () => {
    const half = RESIZE_FOLLOW_MARK_LENGTH_PX / 2;
    const start = -RESIZE_FOLLOW_MARK_THICKNESS_PX - RESIZE_FOLLOW_MARK_GAP_PX;
    const end = RESIZE_FOLLOW_MARK_GAP_PX;
    expect(followMarkCrossOffsetPx("start")).toBe(start);
    expect(followMarkCrossOffsetPx("end")).toBe(end);
    expect(followMarkTransform("vertical", "start", 100)).toBe(
      `translate3d(${start}px, ${100 - half}px, 0)`,
    );
    expect(followMarkTransform("vertical", "end", 100)).toBe(
      `translate3d(${end}px, ${100 - half}px, 0)`,
    );
    expect(followMarkTransform("horizontal", "start", 40)).toBe(
      `translate3d(${40 - half}px, ${start}px, 0)`,
    );
    expect(followMarkTransform("horizontal", "end", 40)).toBe(
      `translate3d(${40 - half}px, ${end}px, 0)`,
    );
  });

  test("one shared border hugs that edge on both approach sides", () => {
    const seam = resizeFollowSeamAt(4);
    expect(followMarkCrossOffsetPx("start", seam)).toBe(
      4 - RESIZE_FOLLOW_MARK_THICKNESS_PX - RESIZE_FOLLOW_MARK_GAP_PX,
    );
    expect(followMarkCrossOffsetPx("end", seam)).toBe(4 + RESIZE_FOLLOW_MARK_GAP_PX);
  });

  test("two pane borders sit the capsule inside the approached card", () => {
    const seam = resizeFollowSeamFromGap(2);
    expect(followMarkCrossOffsetPx("start", seam)).toBe(
      -2 - RESIZE_FOLLOW_MARK_THICKNESS_PX - RESIZE_FOLLOW_MARK_GAP_PX,
    );
    expect(followMarkCrossOffsetPx("end", seam)).toBe(2 + RESIZE_FOLLOW_MARK_GAP_PX);
  });
});
