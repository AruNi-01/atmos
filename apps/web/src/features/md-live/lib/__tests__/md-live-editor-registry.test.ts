import { describe, expect, test } from "bun:test";
import {
  getMdLiveEditor,
  registerMdLiveEditor,
  unregisterMdLiveEditor,
  waitForMdLiveEditor,
  type MdLiveEditorApi,
} from "../md-live-editor-registry";

function stubApi(): MdLiveEditorApi {
  return {
    getMarkdown: () => "",
    getSelectionMarkdown: () => "",
    insertMarkdown: () => {},
    insertText: () => {},
    runBlockAction: () => {},
    startStream: () => true,
    pushChunk: () => {},
    endStream: () => {},
    abortStream: () => {},
    acceptAllDiffs: () => {},
    clearDiffReview: () => {},
  };
}

describe("waitForMdLiveEditor", () => {
  test("resolves an editor registered after waiting", async () => {
    const path = `wait-${Date.now()}.md`;
    const api = stubApi();
    const pending = waitForMdLiveEditor(path, 500);
    registerMdLiveEditor(path, api);
    await expect(pending).resolves.toBe(api);
    unregisterMdLiveEditor(path, api);
    expect(getMdLiveEditor(path)).toBeNull();
  });

  test("times out with null when Live never mounts", async () => {
    const path = `missing-${Date.now()}.md`;
    await expect(waitForMdLiveEditor(path, 20)).resolves.toBeNull();
  });
});
