import { describe, expect, test } from "bun:test";
import type { MdLiveEditorApi } from "../md-live-editor-registry";
import { resolveMdLiveRunEditor } from "../md-live-run-editor";

function stubApi(): MdLiveEditorApi {
  return {
    getMarkdown: () => "hi",
    getSelectionMarkdown: () => "",
    insertMarkdown: () => {},
    runBlockAction: () => {},
    startStream: () => true,
    pushChunk: () => {},
    endStream: () => {},
    abortStream: () => {},
    acceptAllDiffs: () => {},
    clearDiffReview: () => {},
  };
}

describe("resolveMdLiveRunEditor", () => {
  test("returns the mounted editor without switching", async () => {
    const api = stubApi();
    let switched = false;
    const resolved = await resolveMdLiveRunEditor({
      filePath: "/repo/a.md",
      ensureLive: () => {
        switched = true;
      },
      getEditor: () => api,
      waitForEditor: async () => {
        throw new Error("should not wait when already mounted");
      },
    });
    expect(resolved).toBe(api);
    expect(switched).toBe(false);
  });

  test("switches to Live and waits when Source has no editor", async () => {
    const api = stubApi();
    let switched = false;
    const resolved = await resolveMdLiveRunEditor({
      filePath: "/repo/a.md",
      ensureLive: () => {
        switched = true;
      },
      getEditor: () => null,
      waitForEditor: async () => api,
    });
    expect(switched).toBe(true);
    expect(resolved).toBe(api);
  });

  test("returns null when Live never mounts so the caller must not lock", async () => {
    const resolved = await resolveMdLiveRunEditor({
      filePath: "/repo/a.md",
      getEditor: () => null,
      waitForEditor: async () => null,
    });
    expect(resolved).toBeNull();
  });
});
