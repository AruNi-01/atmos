// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { darkColors, lightColors } from "../../theme/colors";
import { agentChatTokenMap, agentChatTokenRoles } from "./token-map";

describe("agent chat token map", () => {
  test("every phone role exists on light and dark", () => {
    for (const role of agentChatTokenRoles) {
      expect(role in agentChatTokenMap).toBe(true);
      expect(typeof lightColors[role]).toBe("string");
      expect(lightColors[role].length).toBeGreaterThan(0);
      expect(typeof darkColors[role]).toBe("string");
      expect(darkColors[role].length).toBeGreaterThan(0);
    }
  });

  test("pins text-sm and text-xs sizes", () => {
    expect(agentChatTokenMap.textSm).toEqual({ fontSize: 14, lineHeight: 20 });
    expect(agentChatTokenMap.textXs).toEqual({ fontSize: 12, lineHeight: 16 });
  });
});
