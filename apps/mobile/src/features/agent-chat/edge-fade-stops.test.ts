// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  AGENT_CHAT_EDGE_FADE_PX,
  PILL_SCROLL_FADE_PX,
  agentChatEdgeFadeGradient,
  agentChatHorizontalEdgeFadeGradient,
} from "./edge-fade-stops";

describe("agent chat edge fade", () => {
  test("uses the web 3.5rem curve and stays on the background hue", () => {
    expect(AGENT_CHAT_EDGE_FADE_PX).toBe(56);
    const top = agentChatEdgeFadeGradient("#f4f4f6", "top");
    expect(top.locations).toEqual([0, 0.24, 0.58, 1]);
    expect(top.colors[0]).toBe("rgba(244, 244, 246, 1)");
    expect(top.colors[3]).toBe("rgba(244, 244, 246, 0)");
    expect(top.colors.join(" ")).not.toContain("rgba(0, 0, 0, 0)");

    const bottom = agentChatEdgeFadeGradient("#f4f4f6", "bottom");
    expect(bottom.locations).toEqual([0, 0.42, 0.76, 1]);
    expect(bottom.colors[0]).toBe("rgba(244, 244, 246, 0)");
    expect(bottom.colors[3]).toBe("rgba(244, 244, 246, 1)");
  });

  test("pill scroller fades stay on the background hue", () => {
    expect(PILL_SCROLL_FADE_PX).toBe(18);
    const left = agentChatHorizontalEdgeFadeGradient("#f4f4f6", "left");
    expect(left.colors).toEqual(["rgba(244, 244, 246, 1)", "rgba(244, 244, 246, 0)"]);
    expect(left.start).toEqual({ x: 0, y: 0 });
    expect(left.end).toEqual({ x: 1, y: 0 });
    const right = agentChatHorizontalEdgeFadeGradient("#f4f4f6", "right");
    expect(right.colors).toEqual(["rgba(244, 244, 246, 0)", "rgba(244, 244, 246, 1)"]);
  });
});
