import { parsePtx } from "../protocol";
import type { PtPersistV2 } from "./adapters";
import { isPreviewBlobPointer } from "./preview-blob";

export { isPreviewBlobPointer } from "./preview-blob";

const PREVIEW_MAX_EDGE = 320;
const PREVIEW_PAD_RATIO = 0.08;
const PREVIEW_PAD_MIN = 12;
const PREVIEW_PAD_MAX = 48;
/** Card is `aspect-[16/10]`; tall boards crop to this so the thumbnail is readable. */
const THUMB_ASPECT = 16 / 10;
/** Only crop when the padded box is clearly taller than the card. */
const TALL_CROP_RATIO = (1 / THUMB_ASPECT) * 1.12;
/** ViewBox padding vs content may not exceed this or it looks like an empty field. */
const VIEWBOX_SLACK_RATIO = 0.5;
const VIEWBOX_SLACK_MIN = 64;

export type PreviewBox = { x: number; y: number; w: number; h: number };

type SketchRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  shape: "rect" | "ellipse" | "line";
  label?: string;
};

function asNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "transparent") return fallback;
  return trimmed;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function hasPtTag(el: Record<string, unknown>): boolean {
  const custom = el.customData;
  if (!custom || typeof custom !== "object") return false;
  const pt = (custom as { pt?: unknown }).pt;
  return Boolean(pt && typeof pt === "object");
}

function ptLabelOf(el: Record<string, unknown>): string | undefined {
  const custom = el.customData;
  if (!custom || typeof custom !== "object") return undefined;
  const pt = (custom as { pt?: { props?: { label?: unknown } } }).pt;
  return typeof pt?.props?.label === "string" ? pt.props.label : undefined;
}

function sketchFromElement(el: Record<string, unknown>): SketchRect | null {
  if (el.isDeleted === true) return null;
  const x = asNum(el.x);
  const y = asNum(el.y);
  if (x === null || y === null) return null;
  const w = Math.abs(asNum(el.width) ?? 0);
  const h = Math.abs(asNum(el.height) ?? 0);
  if (w < 1 && h < 1) return null;
  const type = typeof el.type === "string" ? el.type : "rect";
  return {
    x,
    y,
    w: Math.max(1, w),
    h: Math.max(1, h),
    fill: asColor(el.backgroundColor, "rgba(148,163,184,0.45)"),
    stroke: asColor(el.strokeColor, "rgba(71,85,105,0.85)"),
    shape: type === "ellipse" ? "ellipse" : type === "line" || type === "arrow" ? "line" : "rect",
    label: ptLabelOf(el),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Drop giant empty frames / camera-sized decoys that dwarf real nodes. */
function withoutOutliers(rects: SketchRect[]): SketchRect[] {
  if (rects.length <= 1) return rects;
  const areas = rects.map((rect) => rect.w * rect.h).filter((area) => area > 1);
  const mid = median(areas);
  if (mid <= 0) return rects;
  const kept = rects.filter((rect) => rect.w * rect.h <= mid * 24);
  return kept.length > 0 ? kept : rects;
}

function rectsFromCanvas(canvas: unknown): { rects: SketchRect[]; background: string } {
  if (!canvas || typeof canvas !== "object") return { rects: [], background: "#ffffff" };
  const rec = canvas as {
    elements?: unknown[];
    appState?: { viewBackgroundColor?: unknown };
  };
  const background = asColor(rec.appState?.viewBackgroundColor, "#ffffff");
  const raw: SketchRect[] = [];
  const tagged: SketchRect[] = [];
  for (const item of rec.elements ?? []) {
    if (!item || typeof item !== "object") continue;
    const el = item as Record<string, unknown>;
    if (el.isDeleted === true) continue;
    const sketch = sketchFromElement(el);
    if (!sketch) continue;
    raw.push(sketch);
    if (hasPtTag(el)) tagged.push(sketch);
  }
  const rects = withoutOutliers(tagged.length > 0 ? tagged : raw);
  return { rects, background };
}

function attrFromTag(tag: string, name: string): number | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]+)"`));
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function rectsFromPtxFallback(ptx: string): SketchRect[] {
  const rects: SketchRect[] = [];
  for (const match of ptx.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*>/g)) {
    const tag = match[0];
    const name = match[1]?.toLowerCase();
    if (!name || name === "page" || name === "option" || name === "on" || name === "action") continue;
    const x = attrFromTag(tag, "x");
    const y = attrFromTag(tag, "y");
    const w = attrFromTag(tag, "width");
    const h = attrFromTag(tag, "height");
    if (x === null || y === null || w === null || h === null) continue;
    const labelMatch = tag.match(/\blabel="([^"]*)"/);
    rects.push({
      x,
      y,
      w: Math.max(1, w),
      h: Math.max(1, h),
      fill: "rgba(148,163,184,0.45)",
      stroke: "rgba(71,85,105,0.85)",
      shape: "rect",
      label: labelMatch?.[1] || name,
    });
  }
  return rects;
}

function rectsFromPtx(ptx: string): SketchRect[] {
  try {
    const doc = parsePtx(ptx);
    const parsed = (doc.pages[0]?.nodes ?? []).map((node) => {
      const label =
        typeof node.props.label === "string"
          ? node.props.label
          : typeof node.value === "string" && node.value.trim()
            ? node.value
            : node.type;
      return {
        x: node.x,
        y: node.y,
        w: Math.max(1, node.width),
        h: Math.max(1, node.height),
        fill: "rgba(148,163,184,0.45)",
        stroke: "rgba(71,85,105,0.85)",
        shape: "rect" as const,
        label,
      };
    });
    if (parsed.length > 0) return parsed;
  } catch {
    /* fall through to attribute scan so slightly-invalid PTX still thumbnails */
  }
  return rectsFromPtxFallback(ptx);
}

export function unionPreviewBox(rects: Array<{ x: number; y: number; w: number; h: number }>): PreviewBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

function paddedViewBox(box: PreviewBox): PreviewBox {
  const pad = Math.min(
    PREVIEW_PAD_MAX,
    Math.max(PREVIEW_PAD_MIN, Math.max(box.w, box.h) * PREVIEW_PAD_RATIO),
  );
  return {
    x: box.x - pad,
    y: box.y - pad,
    w: box.w + pad * 2,
    h: box.h + pad * 2,
  };
}

/** Padded content, cropped to a landscape card window when the board is a tall stack. */
export function thumbnailViewBox(content: PreviewBox): PreviewBox {
  const padded = paddedViewBox(content);
  if (padded.h / padded.w > TALL_CROP_RATIO) {
    return { x: padded.x, y: padded.y, w: padded.w, h: padded.w / THUMB_ASPECT };
  }
  return padded;
}

export function contentNeedsLandscapeCrop(content: PreviewBox): boolean {
  return thumbnailViewBox(content).h < content.h * 0.85;
}

export function rasterPreviewSize(preview: string): { w: number; h: number } | null {
  if (!preview.startsWith("data:image/png;base64,")) return null;
  try {
    const b64 = preview.slice("data:image/png;base64,".length);
    const bin = atob(b64.slice(0, 48));
    if (bin.length < 24) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const w = view.getUint32(16);
    const h = view.getUint32(20);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { w, h };
  } catch {
    return null;
  }
}

export function contentBoundsFromPersist(doc: PtPersistV2): PreviewBox | null {
  const fromCanvas = rectsFromCanvas(doc.canvas);
  const rects = fromCanvas.rects.length > 0 ? fromCanvas.rects : rectsFromPtx(doc.ptx);
  return unionPreviewBox(rects);
}

export function viewBoxFitsContent(viewBox: PreviewBox, content: PreviewBox): boolean {
  const contains =
    viewBox.x <= content.x + 1 &&
    viewBox.y <= content.y + 1 &&
    viewBox.x + viewBox.w >= content.x + content.w - 1 &&
    viewBox.y + viewBox.h >= content.y + content.h - 1;
  if (!contains) return false;
  const slack = Math.max(VIEWBOX_SLACK_MIN, Math.max(content.w, content.h) * VIEWBOX_SLACK_RATIO);
  return viewBox.w - content.w <= slack * 2 && viewBox.h - content.h <= slack * 2;
}

export function decodePreviewSvg(preview: string | undefined): string | null {
  if (!preview || !preview.startsWith("data:image/svg+xml")) return null;
  const comma = preview.indexOf(",");
  if (comma < 0) return null;
  const payload = preview.slice(comma + 1);
  const meta = preview.slice(0, comma);
  try {
    if (meta.includes("base64")) {
      return atob(payload);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

export function parsePreviewViewBox(preview: string | undefined): PreviewBox | null {
  const svg = decodePreviewSvg(preview);
  if (!svg) return null;
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match?.[1]) return null;
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts as [number, number, number, number];
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

const LIVE_RASTER_MIN_CHARS = 80;

function isRasterDataUrl(preview: string): boolean {
  return (
    preview.startsWith("data:image/png") ||
    preview.startsWith("data:image/jpeg") ||
    preview.startsWith("data:image/webp")
  );
}

/** SVG-of-rects (and any other SVG thumbnail) is a wireframe, not board artwork. */
export function isSketchWireframePreview(preview: string | undefined): boolean {
  if (!preview) return false;
  if (isPreviewBlobPointer(preview)) return false;
  if (preview.startsWith("data:image/svg+xml")) return true;
  const svg = decodePreviewSvg(preview);
  if (!svg) return false;
  return svg.includes('data-pt-preview="content"') || /<rect[\s>]/.test(svg);
}

export function isEmptyRasterPreview(preview: string | undefined): boolean {
  if (!preview) return true;
  if (isPreviewBlobPointer(preview)) return false;
  if (!isRasterDataUrl(preview)) return isSketchWireframePreview(preview);
  if (preview.length < LIVE_RASTER_MIN_CHARS) return true;
  const size = rasterPreviewSize(preview);
  if (size && (size.w < 8 || size.h < 8)) return true;
  return false;
}

/** Stored board screenshot: raster data URL or IndexedDB pointer — never a bbox-rect SVG. */
export function isLiveRasterPreview(preview: string | undefined): boolean {
  if (!preview) return false;
  if (isPreviewBlobPointer(preview)) return true;
  if (isSketchWireframePreview(preview)) return false;
  if (!isRasterDataUrl(preview)) return false;
  return !isEmptyRasterPreview(preview);
}

/** Wireframe SVGs, empty rasters, and missing thumbs need a live board capture. */
export function previewNeedsRegen(
  preview: string | undefined,
  content: PreviewBox | null,
  _previewFit?: string,
): boolean {
  void _previewFit;
  if (isPreviewBlobPointer(preview)) return false;
  if (!preview) return Boolean(content);
  if (isSketchWireframePreview(preview)) return true;
  if (isRasterDataUrl(preview)) return isEmptyRasterPreview(preview);
  return true;
}

function toSvg(rects: SketchRect[], background: string, box: PreviewBox): string {
  const view = thumbnailViewBox(box);
  const maxEdge = Math.max(view.w, view.h);
  const scale = PREVIEW_MAX_EDGE / maxEdge;
  const width = Math.max(1, Math.round(view.w * scale));
  const height = Math.max(1, Math.round(view.h * scale));
  const shapes = rects
    .map((rect) => {
      const fill = escapeXml(rect.fill);
      const stroke = escapeXml(rect.stroke);
      if (rect.shape === "ellipse") {
        return `<ellipse cx="${rect.x + rect.w / 2}" cy="${rect.y + rect.h / 2}" rx="${rect.w / 2}" ry="${rect.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
      }
      if (rect.shape === "line") {
        return `<line x1="${rect.x}" y1="${rect.y}" x2="${rect.x + rect.w}" y2="${rect.y + rect.h}" stroke="${stroke}" stroke-width="1.5"/>`;
      }
      const label =
        rect.label && rect.w > 36 && rect.h > 16
          ? `<text x="${rect.x + 8}" y="${rect.y + Math.min(rect.h - 6, 18)}" fill="${stroke}" font-size="${Math.min(12, Math.max(8, rect.h * 0.35))}" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(rect.label)}</text>`
          : "";
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"/>${label}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" data-pt-preview="content" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"><rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="${escapeXml(background)}"/>${shapes}</svg>`;
}

/** Cheap board thumbnail from PT nodes / scene geometry, viewBox tight on content. */
export function sketchPreviewFromPersist(doc: PtPersistV2): string | undefined {
  const fromCanvas = rectsFromCanvas(doc.canvas);
  const rects = fromCanvas.rects.length > 0 ? fromCanvas.rects : rectsFromPtx(doc.ptx);
  const box = unionPreviewBox(rects);
  if (!box) return undefined;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(rects, fromCanvas.background, box))}`;
}

export function paperColorFromPersist(doc: PtPersistV2): string {
  return rectsFromCanvas(doc.canvas).background;
}
