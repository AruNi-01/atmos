function canWriteClipboardImage(): boolean {
  return (
    typeof ClipboardItem === "function" &&
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === "function"
  );
}

async function blobFromImageSrc(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("Empty image");
  }
  return blob;
}

function canvasToPng(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  if (width < 1 || height < 1) {
    return Promise.reject(new Error("Invalid image size"));
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas unsupported"));
  }
  ctx.drawImage(source, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = src;
  });
}

async function rasterizeBlobToPng(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        return await canvasToPng(bitmap, bitmap.width, bitmap.height);
      } finally {
        if (typeof bitmap.close === "function") bitmap.close();
      }
    } catch {
      // SVG and some formats need an <img> decode path.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await loadHtmlImage(url);
    return await canvasToPng(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pngBlobFromImageSrc(
  src: string,
  img?: HTMLImageElement | null,
): Promise<Blob> {
  try {
    const blob = await blobFromImageSrc(src);
    if (blob.type === "image/png") return blob;
    return await rasterizeBlobToPng(blob);
  } catch (error) {
    if (img && img.naturalWidth > 0) {
      return canvasToPng(img, img.naturalWidth, img.naturalHeight);
    }
    throw error;
  }
}

/**
 * Copy an image (by URL / data / blob URL) onto the system clipboard as PNG.
 *
 * `clipboard.write` is started in the same turn as the caller so Safari still
 * treats it as a user-gesture; the PNG bytes resolve through ClipboardItem.
 */
export function filenameFromImageSrc(src: string, fallback = "image.png"): string {
  const dataType = src.match(/^data:image\/([a-zA-Z0-9+.-]+)/i);
  if (dataType) {
    const subtype = dataType[1]?.toLowerCase() ?? "png";
    const ext = subtype === "jpeg" ? "jpg" : subtype.replace("+xml", "");
    return `image.${ext || "png"}`;
  }
  try {
    const url = new URL(src, "https://atmos.invalid");
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last && /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(last)) {
      return decodeURIComponent(last);
    }
  } catch {
    // Keep the fallback name.
  }
  return fallback;
}

export type SaveImageResult = "saved" | "cancelled" | "failed";

type SaveWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type SaveFileHandle = {
  createWritable: () => Promise<SaveWritable>;
};

type WindowWithSavePickers = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<SaveFileHandle>;
};

function isPickerAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function imageAcceptForFilename(name: string): Record<string, string[]> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "png";
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : ext === "svg"
            ? "image/svg+xml"
            : "image/png";
  const suffix = ext === "jpeg" ? ".jpg" : `.${ext}`;
  return { [mime]: [suffix] };
}

async function writeBlobToHandle(handle: SaveFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function pickImageSaveDestination(
  filename: string,
): Promise<
  | { status: "ready"; write: (blob: Blob) => Promise<void> }
  | { status: "cancelled" }
  | { status: "unavailable" }
> {
  if (typeof window === "undefined") return { status: "unavailable" };
  const win = window as WindowWithSavePickers;

  if (typeof win.showSaveFilePicker === "function") {
    try {
      const file = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Image",
            accept: imageAcceptForFilename(filename),
          },
        ],
      });
      return {
        status: "ready",
        write: (blob) => writeBlobToHandle(file, blob),
      };
    } catch (error) {
      if (isPickerAbort(error)) return { status: "cancelled" };
    }
  }

  return { status: "unavailable" };
}

async function blobForSave(
  src: string,
  img?: HTMLImageElement | null,
): Promise<Blob> {
  try {
    return await blobFromImageSrc(src);
  } catch {
    if (!img || img.naturalWidth < 1) throw new Error("Image unavailable");
    return canvasToPng(img, img.naturalWidth, img.naturalHeight);
  }
}

function downloadBlob(blob: Blob, filename: string): boolean {
  if (typeof document === "undefined") return false;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  return true;
}

export async function saveImageSrcToDisk(
  src: string,
  filename?: string,
  img?: HTMLImageElement | null,
): Promise<SaveImageResult> {
  if (!src) return "failed";
  const name = filename ?? filenameFromImageSrc(src);
  const destination = await pickImageSaveDestination(name);
  if (destination.status === "cancelled") return "cancelled";
  try {
    const blob = await blobForSave(src, img);
    if (destination.status === "ready") {
      await destination.write(blob);
      return "saved";
    }
    return downloadBlob(blob, name) ? "saved" : "failed";
  } catch {
    return "failed";
  }
}

export async function copyImageSrcToClipboard(
  src: string,
  img?: HTMLImageElement | null,
): Promise<boolean> {
  if (!src || !canWriteClipboardImage()) return false;

  const pngPromise = pngBlobFromImageSrc(src, img);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": pngPromise }),
    ]);
    return true;
  } catch {
    try {
      const png = await pngPromise;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
