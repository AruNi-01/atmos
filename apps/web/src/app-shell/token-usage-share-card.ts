import { toCanvas } from "html-to-image";

export const ATMOS_SITE_URL = "https://atmos.land";
export const ATMOS_SITE_HOST = "atmos.land";
/** Product slogan — matches landing hero / metadata. */
export const ATMOS_SLOGAN = "Atmosphere for Agentic Builders";

/** Share-card chrome in CSS pixels at `scale === 1`. */
export function shareCardChrome(scale: number) {
  const topPad = Math.round(32 * scale);
  const footerPadY = Math.round(18 * scale);
  const brandSize = Math.round(11 * scale);
  const sloganSize = Math.round(14 * scale);
  const lineGap = Math.round(6 * scale);
  const footerH = footerPadY + brandSize + lineGap + sloganSize + footerPadY;
  const outerR = Math.round(20 * scale);
  const seamR = Math.round(14 * scale);
  const padX = Math.round(22 * scale);
  return {
    topPad,
    footerPadY,
    brandSize,
    sloganSize,
    lineGap,
    footerH,
    outerR,
    seamR,
    padX,
  };
}

/** Mark nodes excluded from the page screenshot (share chrome, tabs, etc.). */
export const SHARE_CAPTURE_EXCLUDE_ATTR = "data-token-usage-share-exclude";

export type SocialPlatform = "x" | "reddit" | "facebook" | "threads";

export function buildShareText(args: {
  primaryLine: string;
  slogan: string;
  siteUrl: string;
}): string {
  return `${args.primaryLine}\n${args.slogan}\n${args.siteUrl}`;
}

export function buildSocialShareUrl(
  platform: SocialPlatform,
  args: { text: string; siteUrl: string },
): string {
  const text = args.text;
  const url = args.siteUrl;
  switch (platform) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text.split("\n")[0] ?? text)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
  }
}

/** Full rounded rectangle path. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

type CornerRadii = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

/** Rounded rect with independent corners (for image bottom / footer top). */
function roundRectPathCorners(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: CornerRadii,
) {
  const tl = Math.min(Math.max(0, radii.tl), w / 2, h / 2);
  const tr = Math.min(Math.max(0, radii.tr), w / 2, h / 2);
  const br = Math.min(Math.max(0, radii.br), w / 2, h / 2);
  const bl = Math.min(Math.max(0, radii.bl), w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.quadraticCurveTo(x, y, x + tl, y);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

function shouldIncludeNode(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node instanceof HTMLElement) {
    if (node.hasAttribute(SHARE_CAPTURE_EXCLUDE_ATTR)) return false;
    if (node.closest(`[${SHARE_CAPTURE_EXCLUDE_ATTR}]`)) return false;
  }
  if (node.getAttribute?.("data-slot") === "popover-content") return false;
  if (node.getAttribute?.("data-slot") === "dialog-overlay") return false;
  if (node.getAttribute?.("data-slot") === "dialog-content") return false;
  return true;
}

/**
 * Capture the live overview DOM as a canvas.
 *
 * Does not scroll or mutate the live page — capture root is the overview body
 * only (tabs/header live outside and stay visible while the share popover opens).
 */
export async function captureElementCanvas(
  element: HTMLElement,
  options?: {
    backgroundColor?: string;
    pixelRatio?: number;
  },
): Promise<HTMLCanvasElement> {
  const pixelRatio =
    options?.pixelRatio ?? Math.min(2, window.devicePixelRatio || 2);
  const backgroundColor = options?.backgroundColor ?? "#0c0c0c";

  // Measure without touching scroll position (avoids header/tabs flicker).
  const rect = element.getBoundingClientRect();
  const width = Math.max(
    1,
    Math.ceil(Math.max(rect.width, element.clientWidth, element.scrollWidth)),
  );
  const height = Math.max(
    1,
    Math.ceil(
      Math.max(rect.height, element.clientHeight, element.scrollHeight),
    ),
  );

  // html-to-image clones off-DOM; do not hide/show live chrome for the shot.
  return toCanvas(element, {
    cacheBust: true,
    pixelRatio,
    backgroundColor,
    width,
    height,
    style: {
      boxSizing: "border-box",
      width: `${width}px`,
      height: `${height}px`,
      maxWidth: "none",
      margin: "0",
      transform: "none",
      overflow: "visible",
    },
    filter: shouldIncludeNode,
  });
}

/**
 * Stitch page screenshot + Atmos slogan footer into one share card PNG.
 *
 * Outer card is rounded. The image/footer seam is a rounded divider: footer is
 * drawn on top of the screenshot bottom with top-left/top-right radius so the
 * split curves upward into the image (no gap, no white corner bites).
 */
export async function composeShareCardPng(
  pageCanvas: HTMLCanvasElement,
  options: {
    slogan: string;
    siteHost: string;
    websiteLabel?: string;
    isDark?: boolean;
  },
): Promise<Blob> {
  const isDark = options.isDark !== false;
  const scale = pageCanvas.width >= 1400 ? 2 : pageCanvas.width >= 900 ? 1.5 : 1;
  const chrome = shareCardChrome(scale);
  const pageBg = isDark ? "#0c0c0c" : "#efefef";
  const footerBg = isDark ? "#141414" : "#f4f4f5";
  const fg = isDark ? "#ffffff" : "#0a0a0a";
  const muted = isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.48)";
  const hairline = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

  const out = document.createElement("canvas");
  out.width = pageCanvas.width;
  out.height = chrome.topPad + pageCanvas.height + chrome.footerH;
  const ctx = out.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2d context unavailable");

  ctx.clearRect(0, 0, out.width, out.height);

  // 1) Top pad + screenshot. Extra top band keeps hero type off the rounded edge.
  ctx.fillStyle = pageBg;
  ctx.fillRect(0, 0, out.width, chrome.topPad + pageCanvas.height);
  ctx.drawImage(pageCanvas, 0, chrome.topPad);

  // 2) Footer overlaps the bottom `seamR` of the screenshot so the top edge
  //    can curve upward into the image (tl/tr radius).
  const pageBottom = chrome.topPad + pageCanvas.height;
  const footerTop = pageBottom - chrome.seamR;
  const footerPaintH = chrome.seamR + chrome.footerH;

  ctx.save();
  roundRectPathCorners(ctx, 0, footerTop, out.width, footerPaintH, {
    tl: chrome.seamR,
    tr: chrome.seamR,
    br: 0,
    bl: 0,
  });
  ctx.clip();
  ctx.fillStyle = footerBg;
  ctx.fillRect(0, footerTop, out.width, footerPaintH);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, footerTop + chrome.seamR);
  ctx.quadraticCurveTo(0, footerTop, chrome.seamR, footerTop);
  ctx.lineTo(out.width - chrome.seamR, footerTop);
  ctx.quadraticCurveTo(out.width, footerTop, out.width, footerTop + chrome.seamR);
  ctx.strokeStyle = hairline;
  ctx.lineWidth = Math.max(1, Math.round(scale));
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  const textY = pageBottom;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = `500 ${chrome.brandSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText("Atmos", chrome.padX, textY + chrome.footerPadY);
  ctx.fillStyle = fg;
  ctx.font = `600 ${chrome.sloganSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText(
    options.slogan,
    chrome.padX,
    textY + chrome.footerPadY + chrome.brandSize + chrome.lineGap,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = muted;
  ctx.font = `500 ${chrome.brandSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText(
    options.websiteLabel ?? "Website",
    out.width - chrome.padX,
    textY + chrome.footerPadY,
  );
  ctx.fillStyle = fg;
  ctx.font = `600 ${chrome.sloganSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillText(
    options.siteHost,
    out.width - chrome.padX,
    textY + chrome.footerPadY + chrome.brandSize + chrome.lineGap,
  );

  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  roundRectPath(ctx, 0, 0, out.width, out.height, chrome.outerR);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";

  return canvasToPngBlob(out);
}

/** Capture page + compose footer into final share card blob. */
export async function captureShareCardPng(
  element: HTMLElement,
  options: {
    backgroundColor?: string;
    pixelRatio?: number;
    slogan?: string;
    siteHost?: string;
    websiteLabel?: string;
    isDark?: boolean;
  } = {},
): Promise<Blob> {
  const pageCanvas = await captureElementCanvas(element, {
    backgroundColor: options.backgroundColor,
    pixelRatio: options.pixelRatio,
  });
  return composeShareCardPng(pageCanvas, {
    slogan: options.slogan ?? ATMOS_SLOGAN,
    siteHost: options.siteHost ?? ATMOS_SITE_HOST,
    websiteLabel: options.websiteLabel,
    isDark: options.isDark,
  });
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode PNG"));
      },
      "image/png",
      1,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/**
 * Copy share card image (and optional text) to the system clipboard so the
 * user can paste into social compose boxes (⌘V / Ctrl+V).
 *
 * Desktop web intents cannot attach files; clipboard is the reliable path.
 * Safari often requires Promise-wrapped blobs in ClipboardItem.
 */
export async function copyImageBlobToClipboard(
  blob: Blob,
  text?: string,
): Promise<boolean> {
  if (
    typeof ClipboardItem === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function"
  ) {
    return false;
  }

  const mime = blob.type || "image/png";
  // Ensure a real image/* type — some browsers reject empty/unknown types.
  const imageBlob =
    mime.startsWith("image/")
      ? blob
      : new Blob([blob], { type: "image/png" });
  const imageType = imageBlob.type || "image/png";

  const writeItem = async (data: Record<string, Blob | Promise<Blob>>) => {
    await navigator.clipboard.write([new ClipboardItem(data)]);
  };

  // 1) Prefer image + text together (Chromium).
  if (text) {
    try {
      await writeItem({
        [imageType]: imageBlob,
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      return true;
    } catch {
      // fall through
    }
  }

  // 2) Image only with Promise wrapper (Safari-friendly).
  try {
    await writeItem({
      [imageType]: Promise.resolve(imageBlob),
    });
    return true;
  } catch {
    // fall through
  }

  // 3) Image only with raw Blob.
  try {
    await writeItem({
      [imageType]: imageBlob,
    });
    return true;
  } catch {
    return false;
  }
}

export type NativeShareResult = "shared" | "cancelled" | "unsupported";

/**
 * Native OS share sheet with the PNG attached (Web Share Level 2).
 * Best path for attaching images to social apps on mobile / supporting desktop.
 *
 * - `shared` — user completed share (image may be attached)
 * - `cancelled` — user dismissed the sheet (do not open fallback intents)
 * - `unsupported` — no file share; caller should use clipboard + intent
 */
export async function tryNativeShare(args: {
  blob: Blob;
  filename: string;
  title: string;
  text: string;
  url: string;
}): Promise<NativeShareResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unsupported";
  }

  const type = args.blob.type || "image/png";
  const file = new File([args.blob], args.filename.endsWith(".png") ? args.filename : `${args.filename}.png`, {
    type: type.startsWith("image/") ? type : "image/png",
  });

  const canShareFiles =
    typeof navigator.canShare === "function"
      ? navigator.canShare({ files: [file] })
      : false;

  // Prefer files-only payload first — some targets reject files+url together.
  const attempts: ShareData[] = canShareFiles
    ? [
        { files: [file], title: args.title, text: args.text },
        { files: [file], title: args.title, text: args.text, url: args.url },
        { files: [file] },
      ]
    : [];

  // Last resort: text-only share (no image) — still better than nothing on mobile.
  if (attempts.length === 0 && typeof navigator.share === "function") {
    // Don't fall back to text-only here — caller handles clipboard image + intent.
    return "unsupported";
  }

  for (const data of attempts) {
    try {
      if (
        typeof navigator.canShare === "function" &&
        data.files &&
        !navigator.canShare({ files: data.files })
      ) {
        continue;
      }
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      // Try next payload shape.
    }
  }

  return "unsupported";
}

/** Whether this browser can attach files via the system share sheet. */
export function canNativeShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof navigator.canShare !== "function") {
    // Unknown — attempt at share time.
    return true;
  }
  try {
    const probe = new File([new Uint8Array([0x89, 0x50])], "probe.png", {
      type: "image/png",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
