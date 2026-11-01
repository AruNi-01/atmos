import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  partializeEditorState,
  shouldPersistEditorUi,
} from "@/features/editor/lib/editor-ui-persistence";
import type { OpenFile } from "@/features/editor/store/editor-store-types";

function file(path: string, isPreview: boolean): OpenFile {
  return {
    path,
    name: path.split("/").pop() ?? path,
    content: "body",
    originalContent: "body",
    language: "markdown",
    isSymlink: false,
    isDirty: false,
    isLoading: false,
    isPreview,
    lastOpenedAt: 8,
    lastFocusedAt: 9,
  };
}

describe("editor ui persistence", () => {
  test("keeps unpinned preview tabs and drops only untitled notes", () => {
    const persisted = partializeEditorState({
      workspaceStates: {
        "ws-1": {
          openFiles: [
            file("/repo/pinned.md", false),
            file("/repo/preview.md", true),
            file("untitled:Untitled.md", false),
          ],
          activeFilePath: "/repo/preview.md",
        },
      },
      currentWorkspaceId: "ws-1",
      currentProjectPath: "/repo",
    });
    const openFiles = persisted.workspaceStates["ws-1"]?.openFiles ?? [];
    expect(openFiles.map((item) => item.path)).toEqual(["/repo/pinned.md", "/repo/preview.md"]);
    expect(openFiles.find((item) => item.path === "/repo/preview.md")?.isPreview).toBe(true);
    expect(openFiles.find((item) => item.path === "/repo/pinned.md")?.isPreview).toBe(false);
    expect(persisted.workspaceStates["ws-1"]?.activeFilePath).toBe("/repo/preview.md");
    expect(openFiles.every((item) => item.content === "")).toBe(true);
    expect(openFiles.every((item) => item.isLoading)).toBe(true);
  });

  test("does not persist the empty connection-wipe snapshot", () => {
    expect(shouldPersistEditorUi({ _hasHydrated: false })).toBe(false);
    expect(shouldPersistEditorUi({ _hasHydrated: true })).toBe(true);
    const persist = readFileSync(join(import.meta.dir, "../editor-ui-persistence.ts"), "utf8");
    expect(persist).toContain("flushEditorUiSave");
    expect(persist).toContain("pagehide");
    const store = readFileSync(join(import.meta.dir, "../../store/use-editor-store.ts"), "utf8");
    expect(store).toContain("if (!shouldPersistEditorUi(state)) return");
    expect(store).toContain("if (connectionEpoch === 0) return");
  });
});
