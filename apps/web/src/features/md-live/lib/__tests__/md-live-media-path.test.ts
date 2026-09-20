import { describe, expect, test } from "bun:test";
import {
  isPathInsideRoot,
  mediaLibraryDir,
  nextAvailableName,
  posixRelative,
} from "../md-live-media-path";

describe("md-live media paths", () => {
  test("uses a relative path when the file is inside the workspace", () => {
    expect(posixRelative("/proj/docs", "/proj/docs/shot.png")).toBe("./shot.png");
    expect(posixRelative("/proj/docs", "/proj/.atmos/references/media/img/shot.png")).toBe(
      "../.atmos/references/media/img/shot.png",
    );
  });

  test("detects workspace membership", () => {
    expect(isPathInsideRoot("/proj", "/proj/docs/a.png")).toBe(true);
    expect(isPathInsideRoot("/proj", "/elsewhere/a.png")).toBe(false);
  });

  test("copies outside files into the media library", () => {
    expect(mediaLibraryDir("/proj", "video")).toBe("/proj/.atmos/references/media/video");
    expect(nextAvailableName(new Set(["clip.mp4"]), "clip.mp4")).toBe("clip-1.mp4");
  });
});
