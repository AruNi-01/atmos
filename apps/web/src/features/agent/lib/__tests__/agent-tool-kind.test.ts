import { describe, expect, it } from "bun:test";
import {
  isEmptyToolJson,
  isGenericToolLabel,
  isPlaceholderToolParams,
} from "@/features/agent/lib/agent-tool-kind";

describe("isGenericToolLabel", () => {
  it("treats kind names as generic so path and command can win", () => {
    expect(isGenericToolLabel("Read")).toBe(true);
    expect(isGenericToolLabel("Search")).toBe(true);
    expect(isGenericToolLabel("Run Script")).toBe(true);
    expect(isGenericToolLabel("write")).toBe(true);
    expect(isGenericToolLabel("fileChange")).toBe(true);
    expect(isGenericToolLabel("ReadFile")).toBe(false);
  });
});

describe("empty ACP other payloads", () => {
  it("treats null and {} as placeholder params, not JSON to show", () => {
    expect(isEmptyToolJson({})).toBe(true);
    expect(isEmptyToolJson(null)).toBe(true);
    expect(isPlaceholderToolParams({ type: "other", value: {} })).toBe(true);
    expect(isPlaceholderToolParams({ type: "search", query: "foo" })).toBe(false);
  });
});
