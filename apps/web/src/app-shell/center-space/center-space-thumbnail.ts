import { toCanvas } from "html-to-image";

const THUMB_WIDTH = 280;
const THUMB_HEIGHT = 160;

function canCapture(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Snapshot the live center card into a small JPEG data URL for space previews.
 * Failures are silent — the switcher falls back to a mosaic placeholder.
 */
export async function captureCenterSpaceThumbnail(): Promise<string | null> {
  if (!canCapture()) return null;
  const card = document.querySelector<HTMLElement>("[data-center-stage-card]");
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return null;
  try {
    const canvas = await toCanvas(card, {
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor:
        getComputedStyle(card).backgroundColor || "transparent",
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      style: {
        transform: "none",
        overflow: "hidden",
      },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.getAttribute("data-center-space-switcher")) return false;
        return true;
      },
    });
    const thumb = document.createElement("canvas");
    thumb.width = THUMB_WIDTH;
    thumb.height = THUMB_HEIGHT;
    const ctx = thumb.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    )
      ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background")})`
      : "#111";
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    const scale = Math.max(THUMB_WIDTH / canvas.width, THUMB_HEIGHT / canvas.height);
    const dw = canvas.width * scale;
    const dh = canvas.height * scale;
    ctx.drawImage(canvas, (THUMB_WIDTH - dw) / 2, (THUMB_HEIGHT - dh) / 2, dw, dh);
    return thumb.toDataURL("image/jpeg", 0.62);
  } catch {
    return null;
  }
}
