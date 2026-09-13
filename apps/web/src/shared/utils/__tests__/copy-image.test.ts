import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  copyImageSrcToClipboard,
  filenameFromImageSrc,
  saveImageSrcToDisk,
} from "../copy-image";

const PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
  0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 153, 99,
  96, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96,
  130,
]);

class FakeClipboardItem {
  constructor(public readonly items: Record<string, Blob | Promise<Blob>>) {}
}

function installClipboard(write: (items: FakeClipboardItem[]) => Promise<void>) {
  const previousClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  const previousClipboard = navigator.clipboard;
  (globalThis as { ClipboardItem: typeof FakeClipboardItem }).ClipboardItem =
    FakeClipboardItem;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write },
  });
  return () => {
    if (previousClipboardItem === undefined) {
      Reflect.deleteProperty(globalThis, "ClipboardItem");
    } else {
      (globalThis as { ClipboardItem: unknown }).ClipboardItem = previousClipboardItem;
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: previousClipboard,
    });
  };
}

describe("copyImageSrcToClipboard", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length > 0) restores.pop()?.();
    mock.restore();
  });

  it("writes a fetched PNG blob to the clipboard", async () => {
    const png = new Blob([PNG_BYTES], { type: "image/png" });
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() =>
      Promise.resolve(new Response(png, { status: 200 })),
    );
    restores.push(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const written: FakeClipboardItem[] = [];
    restores.push(
      installClipboard(async (items) => {
        written.push(...items);
      }),
    );

    expect(await copyImageSrcToClipboard("https://example.test/shot.png")).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(1);
    const payload = await written[0]?.items["image/png"];
    expect(payload).toBeInstanceOf(Blob);
    expect((payload as Blob).type).toBe("image/png");
  });

  it("returns false when the clipboard image API is missing", async () => {
    const previous = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
    Reflect.deleteProperty(globalThis, "ClipboardItem");
    restores.push(() => {
      if (previous === undefined) return;
      (globalThis as { ClipboardItem: unknown }).ClipboardItem = previous;
    });

    expect(await copyImageSrcToClipboard("https://example.test/shot.png")).toBe(
      false,
    );
  });

  it("returns false when the image cannot be fetched", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 404 })));
    restores.push(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    restores.push(
      installClipboard(async () => {
        throw new Error("unreachable");
      }),
    );

    expect(await copyImageSrcToClipboard("https://example.test/missing.png")).toBe(
      false,
    );
  });
});

describe("filenameFromImageSrc", () => {
  it("keeps a file name from the URL path and maps data URLs to an extension", () => {
    expect(filenameFromImageSrc("https://example.test/photos/beach.webp?x=1")).toBe(
      "beach.webp",
    );
    expect(filenameFromImageSrc("data:image/jpeg;base64,aaa")).toBe("image.jpg");
  });
});

describe("saveImageSrcToDisk", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length > 0) restores.pop()?.();
    mock.restore();
  });

  it("downloads a fetched image blob", async () => {
    const png = new Blob([PNG_BYTES], { type: "image/png" });
    const originalFetch = globalThis.fetch;
    restores.push(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(png, { status: 200 })),
    ) as unknown as typeof fetch;

    const clicks: string[] = [];
    const objectUrls: string[] = [];
    const fakeLink = {
      href: "",
      download: "",
      rel: "",
      click: () => {
        clicks.push(fakeLink.download);
      },
      remove: () => undefined,
    };
    const previousDocument = (globalThis as { document?: unknown }).document;
    const UrlCtor = globalThis.URL;
    const originalCreateObjectURL = UrlCtor?.createObjectURL;
    const originalRevokeObjectURL = UrlCtor?.revokeObjectURL;
    restores.push(() => {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        (globalThis as { document: unknown }).document = previousDocument;
      }
      if (UrlCtor && originalCreateObjectURL) {
        UrlCtor.createObjectURL = originalCreateObjectURL;
      }
      if (UrlCtor && originalRevokeObjectURL) {
        UrlCtor.revokeObjectURL = originalRevokeObjectURL;
      }
    });
    (globalThis as { document: unknown }).document = {
      createElement: (tag: string) => {
        expect(tag).toBe("a");
        return fakeLink;
      },
      body: {
        appendChild: () => undefined,
        removeChild: () => undefined,
      },
    };
    if (!UrlCtor) {
      (globalThis as { URL: unknown }).URL = {
        createObjectURL: (blob: Blob) => {
          const url = `blob:save-${blob.size}`;
          objectUrls.push(url);
          return url;
        },
        revokeObjectURL: () => undefined,
      };
    } else {
      UrlCtor.createObjectURL = (blob: Blob) => {
        const url = `blob:save-${blob.size}`;
        objectUrls.push(url);
        return url;
      };
      UrlCtor.revokeObjectURL = () => undefined;
    }

    expect(await saveImageSrcToDisk("https://example.test/shot.png", "shot.png")).toBe(
      "saved",
    );
    expect(clicks).toEqual(["shot.png"]);
    expect(objectUrls).toHaveLength(1);
    expect(fakeLink.href).toBe(objectUrls[0]);
  });

  it("writes through the system save-file picker", async () => {
    const png = new Blob([PNG_BYTES], { type: "image/png" });
    const originalFetch = globalThis.fetch;
    restores.push(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(png, { status: 200 })),
    ) as unknown as typeof fetch;

    const written: Blob[] = [];
    const previousWindow = (globalThis as { window?: unknown }).window;
    restores.push(() => {
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        (globalThis as { window: unknown }).window = previousWindow;
      }
    });
    (globalThis as { window: unknown }).window = {
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async (blob: Blob) => {
            written.push(blob);
          },
          close: async () => undefined,
        }),
      }),
    };

    expect(await saveImageSrcToDisk("https://example.test/shot.png", "shot.png")).toBe(
      "saved",
    );
    expect(written).toHaveLength(1);
  });

  it("does not treat a cancelled save picker as a failure", async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    restores.push(() => {
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        (globalThis as { window: unknown }).window = previousWindow;
      }
    });
    (globalThis as { window: unknown }).window = {
      showSaveFilePicker: async () => {
        const error = new Error("The user aborted a request.");
        error.name = "AbortError";
        throw error;
      },
    };

    expect(await saveImageSrcToDisk("https://example.test/shot.png", "shot.png")).toBe(
      "cancelled",
    );
  });
});
