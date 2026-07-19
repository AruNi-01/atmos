// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { canSaveWorkspaceNote } from "../lib/workspace-note";

describe("workspace note saves", () => {
  it("rejects a stale draft instead of overwriting newer content", () => {
    expect(canSaveWorkspaceNote("first draft", "base")).toBe(false);
    expect(canSaveWorkspaceNote("first draft", "first draft")).toBe(true);
    expect(canSaveWorkspaceNote(null, "")).toBe(true);
    expect(canSaveWorkspaceNote("current")).toBe(true);
  });
});
