import { describe, expect, test } from "bun:test";
import { CENTER_TOOL_TAB_VALUES } from "@/app-shell/center-tool-tabs";
import {
  FIXED_TABS,
  shouldSkipLastTabRestoreForUrlTab,
} from "@/app-shell/center-stage-fixed-tabs";

describe("shouldSkipLastTabRestoreForUrlTab", () => {
  test("honors explicit tool tabs so last=files cannot clobber tab=changes", () => {
    expect(shouldSkipLastTabRestoreForUrlTab("changes")).toBe(true);
    expect(shouldSkipLastTabRestoreForUrlTab("files")).toBe(true);
    expect(shouldSkipLastTabRestoreForUrlTab("pt-design")).toBe(true);
    expect(shouldSkipLastTabRestoreForUrlTab("review")).toBe(true);
  });

  test("does not skip restore when URL has no tab or an unknown surface", () => {
    expect(shouldSkipLastTabRestoreForUrlTab(null)).toBe(false);
    expect(shouldSkipLastTabRestoreForUrlTab(undefined)).toBe(false);
    expect(shouldSkipLastTabRestoreForUrlTab("")).toBe(false);
    expect(shouldSkipLastTabRestoreForUrlTab("some/file.ts")).toBe(false);
  });

  test("skips restore for an explicit agent-chat deep link", () => {
    expect(shouldSkipLastTabRestoreForUrlTab("agent-chat:chat-1")).toBe(true);
  });

  test("pt-design is a fixed center tab so strip clicks are not treated as files", () => {
    expect(FIXED_TABS.has("pt-design")).toBe(true);
  });

  test("every registered tool tab is a fixed surface, not an editor path", () => {
    for (const tab of CENTER_TOOL_TAB_VALUES) {
      expect(FIXED_TABS.has(tab)).toBe(true);
    }
  });
});
