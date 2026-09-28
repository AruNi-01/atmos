const PNG_DATA_PREFIX = "data:image/png;base64,";

export function pngBase64FromDataUrl(dataUrl: string): string {
  if (!dataUrl.startsWith(PNG_DATA_PREFIX)) {
    throw new Error("Share card is not a PNG.");
  }
  const payload = dataUrl.slice(PNG_DATA_PREFIX.length).replace(/\s/g, "");
  if (!payload) throw new Error("Share card is not a PNG.");
  return payload;
}
