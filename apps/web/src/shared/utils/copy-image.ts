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
