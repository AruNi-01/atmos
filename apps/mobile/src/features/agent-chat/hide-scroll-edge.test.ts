// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, "../../..");

describe("iOS 26 scroll edge effects", () => {
  test("the native view hides all four edges and is not the gamma marker", () => {
    const swift = readFileSync(
      join(mobile, "modules/atmos-scroll-edge/ios/AtmosScrollEdgeModule.swift"),
      "utf8",
    );
    expect(swift).toContain("scrollView.topEdgeEffect");
    expect(swift).toContain("scrollView.bottomEdgeEffect");
    expect(swift).toContain("scrollView.leftEdgeEffect");
    expect(swift).toContain("scrollView.rightEdgeEffect");
    expect(swift).toContain("effect.isHidden = true");
    expect(swift).not.toContain("ScrollViewMarker");
  });

  test("the transcript and the pill row sit inside HideScrollEdge", () => {
    const transcript = readFileSync(join(here, "AgentChatTranscript.tsx"), "utf8");
    const pills = readFileSync(join(here, "composer-pill-row.tsx"), "utf8");
    const host = readFileSync(join(here, "hide-scroll-edge.tsx"), "utf8");
    expect(transcript).toContain("<HideScrollEdge");
    expect(pills).toContain("<HideScrollEdge");
    expect(host).toContain('process.env.EXPO_OS !== "ios"');
    expect(host).toContain('requireNativeView("AtmosScrollEdge")');
  });
});
