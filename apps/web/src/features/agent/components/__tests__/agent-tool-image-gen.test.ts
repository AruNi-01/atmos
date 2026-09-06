import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AgentToolImageGen", () => {
  test("wires image_gen kind to beui ImageGeneration", () => {
    const block = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolResultBlock.tsx"),
      "utf8",
    );
    const card = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolImageGen.tsx"),
      "utf8",
    );
    expect(block).toContain('part.kind === "image_gen"');
    expect(block).toContain("AgentToolImageGen");
    expect(card).toContain("ImageGeneration");
    expect(card).toContain("composerFileUrlFromPath");
    expect(card).toContain("aspect_ratio");
  });

  test("auto-opens while generating, keeps a compact preview, and enlarges via overlay", () => {
    const card = readFileSync(
      join(import.meta.dir, "../tool-results/AgentToolImageGen.tsx"),
      "utf8",
    );
    expect(card).toContain("isActiveToolStatus(part.status)");
    expect(card).toContain("setOpen(true)");
    expect(card).toContain("generating && !next");
    expect(card).toContain('size="compact"');
    expect(card).toContain("ImagePreviewOverlay");
    expect(card).toContain("open={open}");
  });
});
