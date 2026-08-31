import { describe, expect, it } from "bun:test";
import {
  attachmentFilename,
  composerAttachmentLabel,
  composerFileUrlFromPath,
  composerFilesFromAttachmentParts,
  filesFromComposerParts,
  filesFromQueuedPrompt,
  isImageComposerAttachment,
  mediaTypeFromFilename,
  queuedPromptEditText,
} from "@/features/agent/lib/agent-composer-attachment";

describe("isImageComposerAttachment", () => {
  it("treats image media types with a url as previews", () => {
    expect(
      isImageComposerAttachment({
        id: "1",
        filename: "shot.png",
        mediaType: "image/png",
        url: "blob:shot",
      }),
    ).toBe(true);
  });

  it("falls back to the filename when media type is missing", () => {
    expect(
      isImageComposerAttachment({
        id: "2",
        filename: "photo.JPEG",
        url: "blob:photo",
      }),
    ).toBe(true);
    expect(
      isImageComposerAttachment({
        id: "3",
        filename: "notes.pdf",
        url: "blob:notes",
      }),
    ).toBe(false);
  });

  it("does not preview files without a url", () => {
    expect(
      isImageComposerAttachment({
        id: "4",
        filename: "shot.png",
        mediaType: "image/png",
      }),
    ).toBe(false);
  });

  it("keeps non-image media types as files even with an image-like name", () => {
    expect(
      isImageComposerAttachment({
        id: "5",
        filename: "shot.png",
        mediaType: "application/octet-stream",
        url: "blob:shot",
      }),
    ).toBe(false);
  });

  it("does not preview TIFF because Chromium cannot decode it in img", () => {
    expect(
      isImageComposerAttachment({
        id: "6",
        filename: "shot.tiff",
        mediaType: "image/tiff",
        url: "blob:shot",
      }),
    ).toBe(false);
    expect(
      isImageComposerAttachment({
        id: "7",
        filename: "clipboard.tif",
        url: "blob:shot",
      }),
    ).toBe(false);
  });
});

describe("composerAttachmentLabel", () => {
  it("uses the filename when present", () => {
    expect(
      composerAttachmentLabel(
        { id: "1", filename: " summer-menu.pdf " },
        "File",
      ),
    ).toBe("summer-menu.pdf");
  });

  it("falls back when the filename is empty", () => {
    expect(composerAttachmentLabel({ id: "1" }, "File")).toBe("File");
  });
});

describe("queued prompt composer files", () => {
  it("prefers displayPrompt when editing queued text", () => {
    expect(
      queuedPromptEditText({ prompt: "stored", displayPrompt: "shown" }),
    ).toBe("shown");
    expect(queuedPromptEditText({ prompt: "stored" })).toBe("stored");
  });

  it("reads the filename and media type from an attachment path", () => {
    expect(attachmentFilename("/tmp/chats/a/attachments/shot.png")).toBe("shot.png");
    expect(attachmentFilename("notes.pdf")).toBe("notes.pdf");
    expect(mediaTypeFromFilename("shot.png")).toBe("image/png");
    expect(mediaTypeFromFilename("summer-menu.pdf")).toBe("application/pdf");
    expect(mediaTypeFromFilename("readme")).toBeUndefined();
  });

  it("maps message attachment parts onto composer files", () => {
    const files = composerFilesFromAttachmentParts(
      [
        { type: "text", path: "ignored" },
        {
          type: "attachment",
          path: "/tmp/chats/a/attachments/shot.png",
          name: "shot.png",
        },
        { type: "attachment", path: "/tmp/summer-menu.pdf" },
      ],
      (path) => `http://127.0.0.1:30303/file?path=${path}`,
    );
    expect(files).toEqual([
      {
        id: "/tmp/chats/a/attachments/shot.png",
        filename: "shot.png",
        mediaType: "image/png",
        url: "http://127.0.0.1:30303/file?path=/tmp/chats/a/attachments/shot.png",
      },
      {
        id: "/tmp/summer-menu.pdf",
        filename: "summer-menu.pdf",
        mediaType: "application/pdf",
        url: "http://127.0.0.1:30303/file?path=/tmp/summer-menu.pdf",
      },
    ]);
    expect(isImageComposerAttachment(files[0]!)).toBe(true);
    expect(isImageComposerAttachment(files[1]!)).toBe(false);
  });

  it("builds the system file URL used for queued image previews", () => {
    expect(composerFileUrlFromPath("/tmp/shot.png", "http://127.0.0.1:30303")).toBe(
      "http://127.0.0.1:30303/api/system/file?path=%2Ftmp%2Fshot.png",
    );
    expect(
      composerFileUrlFromPath("/tmp/shot.png", "http://127.0.0.1:30303/", "tok"),
    ).toBe("http://127.0.0.1:30303/api/system/file?path=%2Ftmp%2Fshot.png&token=tok");
  });

  it("clones composer parts into File objects without dropping the original urls", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string) => {
      expect(input).toBe("blob:shot");
      return new Response(new Blob(["img"], { type: "image/png" }), { status: 200 });
    }) as typeof fetch;
    try {
      const files = await filesFromComposerParts([
        { filename: "shot.png", mediaType: "image/png", url: "blob:shot" },
      ]);
      expect(files).toHaveLength(1);
      expect(files[0]?.name).toBe("shot.png");
      expect(files[0]?.type).toBe("image/png");
      expect(await files[0]?.text()).toBe("img");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("turns queued attachment paths into named files", async () => {
    const files = await filesFromQueuedPrompt(
      { attachmentPaths: ["/tmp/summer-menu.pdf", "/tmp/shot.png"] },
    );
    expect(files.map((file) => file.name)).toEqual(["summer-menu.pdf", "shot.png"]);
    expect(files[0]?.type).toBe("application/pdf");
    expect(files[1]?.type).toBe("image/png");
  });

  it("prefers in-memory queued files over attachment paths", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Blob(["kept"], { type: "image/png" }), {
        status: 200,
      })) as typeof fetch;
    try {
      const files = await filesFromQueuedPrompt(
        {
          attachmentPaths: ["/tmp/ignored.pdf"],
          files: [{ filename: "kept.png", mediaType: "image/png", url: "blob:kept" }],
        },
        () => {
          throw new Error("should not load paths when files exist");
        },
      );
      expect(files).toHaveLength(1);
      expect(files[0]?.name).toBe("kept.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
