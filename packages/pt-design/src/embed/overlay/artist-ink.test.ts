import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ARTIST_INK,
  ARTIST_SAMPLE_PX,
  artistSeed,
  fieldMarks,
  gridMarks,
  isTransparentColor,
  marksForBox,
  pathForMark,
  planForBox,
  pressMarks,
  type BorderEdge,
  type BoxInk,
} from "./artist-ink";

const solid = (color = "#1e1e1e"): BorderEdge => ({ width: 1, color, style: "solid" });
const none: BorderEdge = { width: 0, color: "transparent", style: "none" };
const four = (edge: BorderEdge = solid()) => ({ top: edge, right: edge, bottom: edge, left: edge });

function box(partial: Partial<BoxInk> & Pick<BoxInk, "w" | "h">): BoxInk {
  return {
    x: 0,
    y: 0,
    radius: 0,
    borders: four(none),
    background: "transparent",
    role: null,
    ...partial,
  };
}

describe("Artist overlay ink", () => {
  test("matches Excalidraw Artist stroke options", () => {
    expect(ARTIST_INK.roughness).toBe(1);
    expect(ARTIST_INK.strokeWidth).toBe(2);
    expect(ARTIST_INK.disableMultiStroke).toBe(false);
    expect(ARTIST_INK.preserveVertices).toBe(true);
  });

  test("seed is stable for a node id", () => {
    expect(artistSeed("run")).toBe(artistSeed("run"));
    expect(artistSeed("run")).not.toBe(artistSeed("dialog"));
  });

  test("skips the full-bleed frame that duplicates the handle", () => {
    const marks = marksForBox(
      box({ w: 240, h: 80, borders: four(solid()) }),
      { w: 240, h: 80 },
    );
    expect(marks).toEqual([]);
  });

  test("sketches an inner frame that is not the handle", () => {
    const marks = marksForBox(
      box({ x: 12, y: 16, w: 80, h: 32, radius: 6, borders: four(solid()) }),
      { w: 240, h: 80 },
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("frame");
    expect(marks[0]?.radius).toBe(6);
  });

  test("turns a single-side divider into a line", () => {
    const marks = marksForBox(
      box({
        w: 240,
        h: 40,
        borders: { top: none, right: none, bottom: solid(), left: none },
      }),
      { w: 240, h: 160 },
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("line");
    expect(marks[0]?.h).toBe(0);
    expect(marks[0]?.w).toBeGreaterThan(200);
  });

  test("hairline separators become Artist lines", () => {
    const marks = marksForBox(
      box({
        w: 240,
        h: 1,
        background: "#1e1e1e",
        role: "separator",
      }),
      { w: 240, h: 8 },
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("line");
    expect(marks[0]?.h).toBe(0);
  });

  test("pill borders become ellipses", () => {
    const marks = marksForBox(
      box({
        x: 0,
        y: 8,
        w: 44,
        h: 24,
        radius: 999,
        borders: four(solid()),
      }),
      { w: 140, h: 32 },
    );
    expect(marks[0]?.kind).toBe("ellipse");
  });

  test("hides a full-bleed CSS frame so it does not sit inside the handle", () => {
    const plan = planForBox(box({ w: 240, h: 80, borders: four(solid()) }), { w: 240, h: 80 });
    expect(plan.marks).toEqual([]);
    expect(plan.hide).toBe(true);
  });

  test("nested (non-full-bleed) field gets a frame mark", () => {
    const marks = fieldMarks({ x: 16, y: 52, w: 328, h: 40 }, { w: 360, h: 228 });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("frame");
    expect(marks[0]?.radius).toBe(3);
    expect(marks[0]?.color).toBe("#1e1e1e");
    expect(marks[0]?.x).toBe(17);
    expect(marks[0]?.y).toBe(53);
  });

  test("fieldMarks and pressMarks follow the radius token", () => {
    expect(fieldMarks({ x: 16, y: 52, w: 328, h: 40 }, { w: 360, h: 228 }, 14)[0]?.radius).toBe(14);
    expect(fieldMarks({ x: 16, y: 52, w: 328, h: 40 }, { w: 360, h: 228 }, 0)[0]?.radius).toBe(0);
    const press = pressMarks({ x: 0, y: 0, w: 328, h: 40 }, { w: 328, h: 40 }, 28);
    expect(press[0]?.radius).toBe(19);
  });

  test("nested inner artist host (button-sized box filling the inner host) gets a frame mark", () => {
    const inner = { w: 328, h: 40 };
    const marks = pressMarks({ x: 0, y: 0, w: 328, h: 40 }, inner);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("frame");
    expect(marks[0]?.color).toBe("#1e1e1e");
    expect(marks[0]?.x).toBe(1);
    expect(marks[0]?.y).toBe(1);
    expect(marks[0]?.w).toBe(326);
    expect(marks[0]?.h).toBe(38);
    expect(marks[0]?.radius).toBe(12);
  });

  test("overlay-level full-bleed four-side CSS frame is still skipped", () => {
    const plan = planForBox(box({ w: 240, h: 80, borders: four(solid()) }), { w: 240, h: 80 });
    expect(plan.marks).toEqual([]);
    expect(plan.hide).toBe(true);
    expect(fieldMarks({ x: 0, y: 0, w: 240, h: 80 }, { w: 240, h: 80 })).toEqual([]);
    expect(marksForBox(box({ w: 240, h: 80, borders: four(solid()) }), { w: 240, h: 80 })).toEqual([]);
  });

  test("inner strokes are sampled, not two-point CSS lines", () => {
    expect(ARTIST_SAMPLE_PX).toBe(8);
    const d = pathForMark({
      kind: "line",
      x: 0,
      y: 10,
      w: 240,
      h: 0,
      color: "#1e1e1e",
    });
    expect(d.startsWith("M")).toBe(true);
    expect(d.split("L").length).toBeGreaterThan(10);
  });

  test("table cells get inner row and column rules", () => {
    const marks = gridMarks(
      [
        { x: 0, y: 0, w: 120, h: 36 },
        { x: 120, y: 0, w: 120, h: 36 },
        { x: 0, y: 36, w: 120, h: 36 },
        { x: 120, y: 36, w: 120, h: 36 },
      ],
      { w: 240, h: 72 },
    );
    const vertical = marks.filter((mark) => mark.kind === "line" && mark.w === 0);
    const horizontal = marks.filter((mark) => mark.kind === "line" && mark.h === 0);
    expect(vertical.length).toBe(1);
    expect(vertical[0]?.x).toBe(120);
    expect(horizontal.length).toBeGreaterThan(0);
  });

  test("transparent colors are ignored", () => {
    expect(isTransparentColor("transparent")).toBe(true);
    expect(isTransparentColor("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isTransparentColor("rgb(30, 30, 30)")).toBe(false);
    expect(
      marksForBox(
        box({ w: 80, h: 32, borders: four({ width: 1, color: "rgba(0,0,0,0)", style: "solid" }) }),
        { w: 240, h: 80 },
      ),
    ).toEqual([]);
  });
});

describe("overlay wires Artist ink", () => {
  test("OverlayHost paints inner strokes with the Artist helper", () => {
    const host = readFileSync(new URL("./OverlayHost.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./sketch-ui.css", import.meta.url), "utf8");
    expect(host).toContain("ArtistInkHost");
    expect(css).toContain("data-pt-artist-ink");
    expect(css).toContain('[data-pt-artist-ink="line"]');
    expect(css).toContain("data-pt-artist-ready");
    expect(css).toContain("input[type=\"checkbox\"]");
    const ink = readFileSync(new URL("./artist-ink.tsx", import.meta.url), "utf8");
    expect(ink).toContain("addEventListener(\"change\"");
    expect(ink).toContain("attributeFilter");
    expect(ink).toContain("el.dataset.ptArtist");
    expect(ink).toContain("fieldMarks");
    expect(ink).toContain("pressMarks");
    expect(ink).toContain("tokenRadiusOrPill");
    expect(ink).toContain("data-pt-radius");
    expect(ink).toContain("inkKey");
    expect(css).toContain("border-radius: var(--pt-radius, 3px)");
    expect(ink).toContain("data-pt-overlay-fit");
    expect(ink).toContain("INTERACT_PRESS_NODE_TYPE");
    expect(ink).toContain("HTMLTextAreaElement");
    expect(ink).toContain("datetime-local");
    expect(ink).toContain("combobox");
    expect(ink).toContain("native-select");
    expect(css).toContain("[data-pt-artist-ready] [data-pt-artist-ink]");
    expect(css).not.toContain("[data-pt-artist-ready] *");
  });
});
