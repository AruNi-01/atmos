const MAX_PREVIEW_DATA_URL = 220_000;
const PREVIEW_WEBP_QUALITY = 0.82;
const PREVIEW_JPEG_QUALITY = 0.8;

export function dataUrlParts(dataUrl: string): {
  mime: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
} {
  const mime = dataUrl.startsWith("data:image/webp")
    ? "image/webp"
    : dataUrl.startsWith("data:image/jpeg")
      ? "image/jpeg"
      : "image/png";
  const comma = dataUrl.indexOf(",");
  return { mime, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  const parts = dataUrlParts(dataUrl);
  const binary = atob(parts.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: parts.mime });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === "function") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read screenshot"));
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function canvasToPreview(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
}> {
  const webp = await canvasToBlob(canvas, "image/webp", PREVIEW_WEBP_QUALITY);
  if (webp && webp.type === "image/webp" && webp.size > 32) {
    const dataUrl = await blobToDataUrl(webp);
    return { dataUrl, mime: "image/webp", blob: webp };
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", PREVIEW_JPEG_QUALITY);
  if (jpeg && jpeg.size > 32) {
    const dataUrl = await blobToDataUrl(jpeg);
    return { dataUrl, mime: "image/jpeg", blob: jpeg };
  }
  let dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > MAX_PREVIEW_DATA_URL) {
    dataUrl = canvas.toDataURL("image/jpeg", PREVIEW_JPEG_QUALITY);
  }
  const parts = dataUrlParts(dataUrl);
  return { dataUrl, mime: parts.mime, blob: await blobFromDataUrl(dataUrl) };
}

async function encodePreviewCanvas(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
  width: number;
  height: number;
}> {
  const encoded = await canvasToPreview(canvas);
  return { ...encoded, width: canvas.width, height: canvas.height };
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  mime: "image/png";
  blob: Blob;
}> {
  const png = await canvasToBlob(canvas, "image/png");
  if (png && png.type === "image/png" && png.size > 32) {
    return { dataUrl: await blobToDataUrl(png), mime: "image/png", blob: png };
  }
  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, mime: "image/png", blob: await blobFromDataUrl(dataUrl) };
}

/** Agent `pt_screenshot` (`preview !== true`) encodes PNG. Library thumbs still prefer webp/jpeg. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  preview: boolean,
): Promise<{
  dataUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
  width: number;
  height: number;
}> {
  if (preview) return encodePreviewCanvas(canvas);
  const encoded = await canvasToPng(canvas);
  return { ...encoded, width: canvas.width, height: canvas.height };
}
