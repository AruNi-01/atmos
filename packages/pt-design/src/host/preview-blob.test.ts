import { afterEach, describe, expect, test } from "bun:test";
import {
  deletePreviewBlob,
  getPreviewBlob,
  getPreviewObjectUrl,
  persistPreviewImage,
  previewBlobPointer,
  resetPreviewBlobMemory,
} from "./preview-blob";

afterEach(() => {
  resetPreviewBlobMemory();
});

describe("pt-design preview blob store", () => {
  test("stores a raster off persist JSON and returns a pointer", async () => {
    const dataUrl = `data:image/jpeg;base64,${btoa("preview-bytes-preview-bytes-preview-bytes")}`;
    const pointer = await persistPreviewImage("doc-1", dataUrl);
    expect(pointer).toBe(previewBlobPointer("doc-1"));
    const blob = await getPreviewBlob("doc-1");
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeGreaterThan(32);
    const url = getPreviewObjectUrl("doc-1");
    expect(url).toBe(getPreviewObjectUrl("doc-1"));
    expect(typeof url === "string" || url === undefined).toBe(true);
  });

  test("delete removes the stored thumb", async () => {
    const dataUrl = `data:image/webp;base64,${btoa("preview-bytes-preview-bytes-preview-bytes")}`;
    await persistPreviewImage("doc-2", dataUrl);
    await deletePreviewBlob("doc-2");
    expect(await getPreviewBlob("doc-2")).toBeNull();
  });
});
