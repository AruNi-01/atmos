// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  PREVIEW_WORKSPACES,
  previewEntriesForWorkspace,
} from "./preview-fixtures";

describe("preview fixtures", () => {
  test("keeps same-name tmux windows as sibling tabs", () => {
    const entries = previewEntriesForWorkspace("ws-atmos");

    expect(entries.map((entry) => entry.id)).toEqual([
      "tmux:ws-atmos:0",
      "tmux:ws-atmos:1:tab",
      "tmux:ws-atmos:1:window",
      "tmux:ws-atmos:2",
    ]);
    expect(entries.filter((entry) => entry.label === "zsh")).toHaveLength(2);
  });

  test("sorts landing terminals by tmux index", () => {
    expect(previewEntriesForWorkspace("ws-landing").map((entry) => entry.id)).toEqual([
      "tmux:ws-landing:1",
      "tmux:ws-landing:3",
    ]);
  });

  test("covers more than one mock workspace", () => {
    expect(PREVIEW_WORKSPACES.map((workspace) => workspace.id)).toEqual(["ws-atmos", "ws-landing"]);
  });
});
