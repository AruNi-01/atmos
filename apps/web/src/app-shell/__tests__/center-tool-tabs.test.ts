import { describe, expect, test } from "bun:test";
import {
  CENTER_TOOL_TAB_VALUES,
  isCenterToolTabValue,
} from "@/app-shell/center-tool-tabs";

describe("center tool tabs", () => {
  test("recognizes center tool modules", () => {
    expect(CENTER_TOOL_TAB_VALUES).toEqual(["changes", "review", "run", "github", "files", "pt-design"]);
    for (const value of CENTER_TOOL_TAB_VALUES) {
      expect(isCenterToolTabValue(value)).toBe(true);
    }
    expect(isCenterToolTabValue("github-pr:ws:1")).toBe(false);
    expect(isCenterToolTabValue("browser")).toBe(false);
    expect(isCenterToolTabValue("files")).toBe(true);
  });
});
