import { describe, expect, test } from "bun:test";
import { classifyMdLiveMedia, mdLiveMediaMarkdown } from "./media";

describe("md-live media", () => {
  test("classifies by extension", () => {
    expect(classifyMdLiveMedia("photo.PNG")).toBe("img");
    expect(classifyMdLiveMedia("./clip.mp4")).toBe("video");
    expect(classifyMdLiveMedia("note.m4a")).toBe("audio");
    expect(classifyMdLiveMedia("spec.pdf")).toBe("file");
  });

  test("writes image markdown for visual media and links for files", () => {
    expect(mdLiveMediaMarkdown("img", "shot.png", "./shot.png")).toBe("![shot.png](./shot.png)");
    expect(mdLiveMediaMarkdown("video", "clip.mp4", "../.atmos/references/media/video/clip.mp4")).toBe(
      "![clip.mp4](../.atmos/references/media/video/clip.mp4)",
    );
    expect(mdLiveMediaMarkdown("file", "spec.pdf", "./spec.pdf")).toBe("![spec.pdf](./spec.pdf)");
  });
});
