import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import rough from "roughjs";
import { HANDLE_INK, HANDLE_STROKE_WIDTH } from "../../excalidraw-bridge";

/** Same as Excalidraw Artist: roughness 1, 2px, two offset paths, pinned corners. */
export const ARTIST_INK = {
  roughness: 1,
  strokeWidth: HANDLE_STROKE_WIDTH,
  disableMultiStroke: false,
  preserveVertices: true,
  bowing: 1,
  fill: "none",
  stroke: HANDLE_INK,
} as const;

/** Sample along an edge so a short divider has the same vertex density as a large Artist frame. */
export const ARTIST_SAMPLE_PX = HANDLE_STROKE_WIDTH * 4;

export type BorderEdge = {
  width: number;
  color: string;
  style: string;
};

export type BoxInk = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  borders: {
    top: BorderEdge;
    right: BorderEdge;
    bottom: BorderEdge;
    left: BorderEdge;
  };
  background: string;
  role: string | null;
};

export type InkKind = "frame" | "line" | "ellipse" | "path" | "omit";

export type InkMark = {
  kind: InkKind;
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  color: string;
  dashed?: boolean;
  d?: string;
};

export function artistSeed(id: string): number {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0) % 2 ** 31 || 1;
}

export function isTransparentColor(color: string): boolean {
  const t = color.replace(/\s+/g, "").toLowerCase();
  if (!t || t === "transparent" || t === "none") return true;
  if (t === "rgba(0,0,0,0)" || t === "rgb(0,0,0,0)") return true;
  if (/^#[0-9a-f]{4}$/.test(t) && t.endsWith("0")) return true;
  if (/^#[0-9a-f]{8}$/.test(t) && t.endsWith("00")) return true;
  const alpha = t.match(/^rgba?\([^,]+,[^,]+,[^,]+,([0-9.]+)\)$/);
  if (alpha && Number(alpha[1]) === 0) return true;
  return false;
}

function visibleEdge(edge: BorderEdge): boolean {
  return edge.width >= 0.5 && edge.style !== "none" && edge.style !== "hidden" && !isTransparentColor(edge.color);
}

function isDashed(style: string): boolean {
  return style === "dashed" || style === "dotted";
}

function isFullBleed(box: BoxInk, root: { w: number; h: number }): boolean {
  return box.x <= 2 && box.y <= 2 && box.w >= root.w - 4 && box.h >= root.h - 4;
}

function isHairline(box: BoxInk): boolean {
  if (box.role === "separator") return true;
  if (isTransparentColor(box.background)) return false;
  return (box.h <= 2 && box.w > 8) || (box.w <= 2 && box.h > 8);
}

function insetFrame(box: BoxInk): { x: number; y: number; w: number; h: number } {
  const pad = 1.5;
  const w = Math.max(1, box.w - pad * 2);
  const h = Math.max(1, box.h - pad * 2);
  return { x: box.x + pad, y: box.y + pad, w, h };
}

export function polylinePath(points: Array<[number, number]>, close = false): string {
  if (points.length === 0) return "";
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length; i++) d += `L${points[i]![0]} ${points[i]![1]}`;
  return close ? `${d}Z` : d;
}

export function sampleSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  step = ARTIST_SAMPLE_PX,
): Array<[number, number]> {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.ceil(len / Math.max(1, step)));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  }
  return pts;
}

function sampleArc(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const len = Math.abs(a1 - a0) * r;
  const n = Math.max(2, Math.ceil(len / ARTIST_SAMPLE_PX));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function sampleRoundedRect(x: number, y: number, w: number, h: number, r: number): Array<[number, number]> {
  const radius = Math.min(Math.max(0, r), w / 2, h / 2);
  if (radius <= 0.5) {
    return [
      ...sampleSegment(x, y, x + w, y),
      ...sampleSegment(x + w, y, x + w, y + h).slice(1),
      ...sampleSegment(x + w, y + h, x, y + h).slice(1),
      ...sampleSegment(x, y + h, x, y).slice(1),
    ];
  }
  return [
    ...sampleSegment(x + radius, y, x + w - radius, y),
    ...sampleArc(x + w - radius, y + radius, radius, -Math.PI / 2, 0).slice(1),
    ...sampleSegment(x + w, y + radius, x + w, y + h - radius).slice(1),
    ...sampleArc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2).slice(1),
    ...sampleSegment(x + w - radius, y + h, x + radius, y + h).slice(1),
    ...sampleArc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI).slice(1),
    ...sampleSegment(x, y + h - radius, x, y + radius).slice(1),
    ...sampleArc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5).slice(1),
  ];
}

function sampleEllipse(cx: number, cy: number, rx: number, ry: number): Array<[number, number]> {
  const peri = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.max(8, Math.ceil(peri / ARTIST_SAMPLE_PX));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

export function pathForMark(mark: InkMark): string {
  if (mark.kind === "omit") return "";
  if (mark.kind === "path") return mark.d ?? "";
  if (mark.kind === "line") {
    return polylinePath(sampleSegment(mark.x, mark.y, mark.x + mark.w, mark.y + mark.h));
  }
  if (mark.kind === "ellipse") {
    return polylinePath(sampleEllipse(mark.x + mark.w / 2, mark.y + mark.h / 2, mark.w / 2, mark.h / 2), true);
  }
  return polylinePath(sampleRoundedRect(mark.x, mark.y, mark.w, mark.h, mark.radius ?? 0), true);
}

function uniqueSorted(values: number[], tol = 2): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(last - value) > tol) out.push(value);
    else out[out.length - 1] = (last + value) / 2;
  }
  return out;
}

function near(value: number, edge: number, tol = 2): boolean {
  return Math.abs(value - edge) <= tol;
}

/** Inner row/column rules for a table. Outer edges stay on the Excalidraw handle. */
export function gridMarks(
  cells: Array<{ x: number; y: number; w: number; h: number }>,
  root: { w: number; h: number },
  color = HANDLE_INK,
): InkMark[] {
  if (cells.length === 0) return [];
  const xs: number[] = [];
  const ys: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    xs.push(cell.x, cell.x + cell.w);
    ys.push(cell.y, cell.y + cell.h);
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + cell.w);
    maxY = Math.max(maxY, cell.y + cell.h);
  }
  const marks: InkMark[] = [];
  for (const x of uniqueSorted(xs)) {
    if (near(x, 0) || near(x, root.w) || near(x, minX) || near(x, maxX)) continue;
    marks.push({ kind: "line", x, y: minY + 1, w: 0, h: Math.max(0, maxY - minY - 2), color });
  }
  for (const y of uniqueSorted(ys)) {
    if (near(y, 0) || near(y, root.h) || near(y, minY)) continue;
    marks.push({ kind: "line", x: minX + 1, y, w: Math.max(0, maxX - minX - 2), h: 0, color });
  }
  return marks;
}

export function marksForBox(box: BoxInk, root: { w: number; h: number }): InkMark[] {
  if (box.w < 1 || box.h < 1) return [];
  if (isHairline(box)) {
    const vertical = box.w < box.h;
    return [
      {
        kind: "line",
        x: vertical ? box.x + box.w / 2 : box.x + 2,
        y: vertical ? box.y + 2 : box.y + box.h / 2,
        w: vertical ? 0 : Math.max(0, box.w - 4),
        h: vertical ? Math.max(0, box.h - 4) : 0,
        color: isTransparentColor(box.background) ? HANDLE_INK : box.background,
      },
    ];
  }

  const { top, right, bottom, left } = box.borders;
  const sides = [
    visibleEdge(top) ? top : null,
    visibleEdge(right) ? right : null,
    visibleEdge(bottom) ? bottom : null,
    visibleEdge(left) ? left : null,
  ];
  const vis = sides.filter(Boolean);
  if (vis.length === 0) return [];
  if (isFullBleed(box, root) && vis.length === 4) return [];

  if (vis.length === 4) {
    const color = top.color;
    const dashed = isDashed(top.style);
    const box2 = insetFrame(box);
    const radius = Math.min(box.radius, box2.w / 2, box2.h / 2);
    if (radius >= Math.min(box2.w, box2.h) / 2 - 0.5) {
      return [{ kind: "ellipse", ...box2, color, dashed }];
    }
    return [{ kind: "frame", ...box2, radius, color, dashed }];
  }

  const marks: InkMark[] = [];
  const dash = isDashed(top.style) || isDashed(right.style) || isDashed(bottom.style) || isDashed(left.style);
  if (visibleEdge(top)) {
    marks.push({
      kind: "line",
      x: box.x + 1,
      y: box.y + top.width / 2,
      w: Math.max(0, box.w - 2),
      h: 0,
      color: top.color,
      dashed: dash,
    });
  }
  if (visibleEdge(bottom)) {
    marks.push({
      kind: "line",
      x: box.x + 1,
      y: box.y + box.h - bottom.width / 2,
      w: Math.max(0, box.w - 2),
      h: 0,
      color: bottom.color,
      dashed: dash,
    });
  }
  if (visibleEdge(left)) {
    marks.push({
      kind: "line",
      x: box.x + left.width / 2,
      y: box.y + 1,
      w: 0,
      h: Math.max(0, box.h - 2),
      color: left.color,
      dashed: dash,
    });
  }
  if (visibleEdge(right)) {
    marks.push({
      kind: "line",
      x: box.x + box.w - right.width / 2,
      y: box.y + 1,
      w: 0,
      h: Math.max(0, box.h - 2),
      color: right.color,
      dashed: dash,
    });
  }
  return marks;
}

export function planForBox(box: BoxInk, root: { w: number; h: number }): { hide: boolean; marks: InkMark[] } {
  const marks = marksForBox(box, root);
  if (marks.length > 0) return { hide: true, marks };
  const vis = [box.borders.top, box.borders.right, box.borders.bottom, box.borders.left].filter(visibleEdge);
  if (vis.length > 0) return { hide: true, marks: [] };
  return { hide: false, marks: [] };
}

function checkPath(x: number, y: number, w: number, h: number): string {
  const a = sampleSegment(x + w * 0.2, y + h * 0.55, x + w * 0.42, y + h * 0.78);
  const b = sampleSegment(x + w * 0.42, y + h * 0.78, x + w * 0.82, y + h * 0.22);
  return polylinePath([...a, ...b.slice(1)]);
}

function widgetMarks(el: HTMLInputElement, host: HTMLElement): InkMark[] {
  const box = readLiveBox(el, host);
  const pad = 1;
  const x = box.x + pad;
  const y = box.y + pad;
  const w = Math.max(8, box.w - pad * 2);
  const h = Math.max(8, box.h - pad * 2);
  if (el.type === "radio") {
    const marks: InkMark[] = [{ kind: "ellipse", x, y, w, h, color: HANDLE_INK }];
    if (el.checked) {
      marks.push({
        kind: "ellipse",
        x: x + w * 0.28,
        y: y + h * 0.28,
        w: w * 0.44,
        h: h * 0.44,
        color: HANDLE_INK,
      });
    }
    return marks;
  }
  const marks: InkMark[] = [{ kind: "frame", x, y, w, h, radius: 3, color: HANDLE_INK }];
  if (el.checked) {
    marks.push({ kind: "path", x, y, w, h, color: HANDLE_INK, d: checkPath(x, y, w, h) });
  }
  return marks;
}

function isWidget(el: HTMLElement): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
}

function isTableChrome(el: HTMLElement): boolean {
  return /^(TABLE|THEAD|TBODY|TFOOT|TR|TH|TD|COL|COLGROUP)$/.test(el.tagName);
}

function readEdge(cs: CSSStyleDeclaration, side: "Top" | "Right" | "Bottom" | "Left"): BorderEdge {
  return {
    width: Number.parseFloat(cs[`border${side}Width` as "borderTopWidth"]) || 0,
    color: cs[`border${side}Color` as "borderTopColor"] || "transparent",
    style: cs[`border${side}Style` as "borderTopStyle"] || "none",
  };
}

function readLiveBox(el: HTMLElement, root: HTMLElement): BoxInk {
  const cs = getComputedStyle(el);
  const rr = el.getBoundingClientRect();
  const origin = root.getBoundingClientRect();
  const scaleX = origin.width / Math.max(1, root.offsetWidth);
  const scaleY = origin.height / Math.max(1, root.offsetHeight);
  return {
    x: (rr.left - origin.left) / scaleX,
    y: (rr.top - origin.top) / scaleY,
    w: rr.width / scaleX,
    h: rr.height / scaleY,
    radius: Number.parseFloat(cs.borderTopLeftRadius) || 0,
    borders: {
      top: readEdge(cs, "Top"),
      right: readEdge(cs, "Right"),
      bottom: readEdge(cs, "Bottom"),
      left: readEdge(cs, "Left"),
    },
    background: cs.backgroundColor,
    role: el.getAttribute("role"),
  };
}

function artistOptions(mark: InkMark, seed: number) {
  return {
    ...ARTIST_INK,
    stroke: mark.color || HANDLE_INK,
    seed,
    ...(mark.dashed ? { strokeLineDash: mark.kind === "line" ? [5, 4] : [6, 4] } : {}),
  };
}

export function paintArtistInk(svg: SVGSVGElement, marks: InkMark[], seed: number): void {
  svg.replaceChildren();
  const rc = rough.svg(svg);
  marks.forEach((mark, index) => {
    if (mark.kind === "omit") return;
    const d = pathForMark(mark);
    if (!d) return;
    svg.appendChild(rc.path(d, artistOptions(mark, seed + index + 1)));
  });
}

type StoredInk = Pick<BoxInk, "radius" | "borders" | "background" | "role">;

function readBox(el: HTMLElement, host: HTMLElement): BoxInk {
  const live = readLiveBox(el, host);
  const raw = el.getAttribute("data-pt-artist-spec");
  if (!raw) return live;
  try {
    const spec = JSON.parse(raw) as StoredInk;
    return {
      ...live,
      radius: spec.radius,
      borders: spec.borders,
      background: spec.background,
      role: spec.role,
    };
  } catch {
    return live;
  }
}

function collectMarks(host: HTMLElement): { marks: InkMark[]; inked: Array<{ el: HTMLElement; kind: InkKind }> } {
  const root = { w: host.offsetWidth, h: host.offsetHeight };
  const marks: InkMark[] = [];
  const inked: Array<{ el: HTMLElement; kind: InkKind }> = [];
  const walk = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.ptArtistSvg !== undefined) return;
    if (el !== host) {
      if (el.tagName === "TABLE") {
        const cells = [...el.querySelectorAll("th, td")].flatMap((cell) =>
          cell instanceof HTMLElement ? [readLiveBox(cell, host)] : [],
        );
        marks.push(...gridMarks(cells, root, HANDLE_INK));
        inked.push({ el, kind: "omit" });
        for (const cell of el.querySelectorAll("th, td")) {
          if (cell instanceof HTMLElement) inked.push({ el: cell, kind: "omit" });
        }
      } else if (isWidget(el)) {
        const next = widgetMarks(el, host);
        marks.push(...next);
        inked.push({ el, kind: el.type === "radio" ? "ellipse" : "frame" });
      } else if (!isTableChrome(el)) {
        const plan = planForBox(readBox(el, host), root);
        if (plan.hide) inked.push({ el, kind: plan.marks[0]?.kind ?? "omit" });
        marks.push(...plan.marks);
      }
    }
    for (const child of el.children) walk(child);
  };
  walk(host);
  return { marks, inked };
}

export function attachArtistInk(svg: SVGSVGElement, host: HTMLElement, seedKey: string): () => void {
  const tagged: HTMLElement[] = [];
  let painting = false;
  const draw = () => {
    if (painting) return;
    painting = true;
    try {
      const width = Math.max(1, host.offsetWidth);
      const height = Math.max(1, host.offsetHeight);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      const { marks, inked } = collectMarks(host);
      for (const item of inked) {
        if (!item.el.hasAttribute("data-pt-artist-spec")) {
          const box = readBox(item.el, host);
          item.el.setAttribute(
            "data-pt-artist-spec",
            JSON.stringify({
              radius: box.radius,
              borders: box.borders,
              background: box.background,
              role: box.role,
            } satisfies StoredInk),
          );
          tagged.push(item.el);
        }
        item.el.setAttribute("data-pt-artist-ink", item.kind);
      }
      host.setAttribute("data-pt-artist-ready", "");
      paintArtistInk(svg, marks, artistSeed(seedKey));
    } finally {
      painting = false;
    }
  };

  draw();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
  ro?.observe(host);
  const mo = typeof MutationObserver === "function" ? new MutationObserver(draw) : null;
  mo?.observe(host, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["checked", "aria-checked", "aria-pressed"],
  });
  const onChange = () => draw();
  const onClick = () => {
    requestAnimationFrame(() => requestAnimationFrame(draw));
  };
  host.addEventListener("change", onChange, true);
  host.addEventListener("click", onClick, true);

  return () => {
    ro?.disconnect();
    mo?.disconnect();
    host.removeEventListener("change", onChange, true);
    host.removeEventListener("click", onClick, true);
    host.removeAttribute("data-pt-artist-ready");
    for (const el of tagged) {
      el.removeAttribute("data-pt-artist-ink");
      el.removeAttribute("data-pt-artist-spec");
    }
    svg.replaceChildren();
  };
}

export function ArtistInkHost({
  seed,
  children,
}: {
  seed: string;
  children: ReactNode;
}): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const svg = svgRef.current;
    if (!host || !svg) return;
    return attachArtistInk(svg, host, seed);
  }, [seed]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}>
      <svg
        ref={svgRef}
        data-pt-artist-svg=""
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <div
        ref={hostRef}
        data-pt-artist-host=""
        style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, minHeight: 0, zIndex: 0 }}
      >
        {children}
      </div>
    </div>
  );
}
