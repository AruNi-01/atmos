import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const message = readFileSync(join(import.meta.dir, "message.tsx"), "utf8");
const stream = readFileSync(join(import.meta.dir, "smooth-stream-text.ts"), "utf8");

describe("MessageResponse display buffer", () => {
  it("smooth-releases tokens only while animating, and prefers-reduced-motion shows the source immediately", () => {
    expect(message).toContain("useReducedMotion");
    expect(message).toContain("const streaming = !reducedMotion && isAnimating");
    expect(message).toContain("useSmoothStreamText(source, streaming)");
    expect(stream).toContain("if (!enabled)");
    expect(stream).toContain("if (shownRef.current !== text) setShown(text)");
    expect(stream).toContain("return enabled ? shown : text");
    expect(stream).toContain("DRAIN_AFTER");
    expect(stream).toContain("DRAIN_FRACTION");
  });

  it("stop and error turn isAnimating off so the buffer returns the full source immediately", () => {
    expect(message).toContain("const streaming = !reducedMotion && isAnimating");
    expect(message).toContain("useSmoothStreamText(source, streaming)");
    expect(stream).toContain("return enabled ? shown : text");
  });
});
