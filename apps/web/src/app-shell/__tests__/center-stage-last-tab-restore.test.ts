import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CENTER_TOOL_TAB_VALUES } from "@/app-shell/center-tool-tabs";
import {
  FIXED_TABS,
  isEditorDocumentLastTab,
  resolveCenterLastTabRestore,
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

describe("resolveCenterLastTabRestore", () => {
  test("treats unpinned preview paths as editor documents", () => {
    expect(isEditorDocumentLastTab("/repo/notes/draft.md")).toBe(true);
    expect(isEditorDocumentLastTab("terminal")).toBe(false);
    expect(isEditorDocumentLastTab("agent-chat:chat-1")).toBe(false);
    expect(isEditorDocumentLastTab("files")).toBe(false);
  });

  test("waits for editor hydrate instead of falling back to terminal", () => {
    expect(
      resolveCenterLastTabRestore({
        last: "/repo/notes/draft.md",
        editorHydrated: false,
        openFilePaths: [],
      }),
    ).toBe("wait");
  });

  test("restores an unpinned preview path after editor hydrate", () => {
    expect(
      resolveCenterLastTabRestore({
        last: "/repo/notes/draft.md",
        editorHydrated: true,
        openFilePaths: ["/repo/pinned.ts", "/repo/notes/draft.md"],
      }),
    ).toBe("activate");
  });

  test("falls back only when the editor document is truly gone", () => {
    expect(
      resolveCenterLastTabRestore({
        last: "/repo/notes/draft.md",
        editorHydrated: true,
        openFilePaths: ["/repo/pinned.ts"],
      }),
    ).toBe("fallback");
    expect(
      resolveCenterLastTabRestore({
        last: "terminal",
        editorHydrated: false,
        openFilePaths: [],
      }),
    ).toBe("activate");
  });

  test("CenterStage waits on editor hydrate before last-tab fallback", () => {
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    expect(stage).toContain("resolveCenterLastTabRestore");
    expect(stage).toContain("editorHydrated: isEditorHydrated");
    expect(stage).toContain('if (lastTabDecision === "wait") return');
    expect(stage).not.toContain("!FIXED_TABS.has(last)");
  });
});
