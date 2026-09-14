import { describe, expect, test } from "bun:test";
import { runSessionTool } from "../agent/session-tools";
import { createHeadlessSession } from "../core/headless-session";
import { PtDesignError } from "../protocol";

describe("S33 screenshot", () => {
  test("headless pt_screenshot is path_denied (live tab only)", () => {
    try {
      runSessionTool(createHeadlessSession(), { name: "pt_screenshot", args: {} });
      throw new Error("expected path_denied");
    } catch (error) {
      expect(error).toBeInstanceOf(PtDesignError);
      expect((error as PtDesignError).code).toBe("path_denied");
    }
  });

  test.skip("S33 live capture returns png bytes — captureLiveScreenshot imports @excalidraw/excalidraw exportToBlob and needs a canvas Image; not cheap in bun without a real Excalidraw board", () => {
    // Live PNG bytes are a playground/E2E concern. See TEST.md S33.
  });
});
