import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DiffCodeViewScaffold file tree gate", () => {
  const scaffold = readFileSync(
    join(import.meta.dir, "../DiffCodeViewScaffold.tsx"),
    "utf8",
  );
  const changes = readFileSync(
    join(import.meta.dir, "../ChangesCodeView.tsx"),
    "utf8",
  );
  const review = readFileSync(
    join(import.meta.dir, "../ReviewCodeView.tsx"),
    "utf8",
  );
  const prFiles = readFileSync(
    join(import.meta.dir, "../../../github/components/PRFilesTab.tsx"),
    "utf8",
  );

  test("supports showFileTree to hide the left fold control and tree", () => {
    expect(scaffold).toContain("showFileTree?: boolean");
    expect(scaffold).toContain("showFileTree = true");
    expect(scaffold).toContain("const fileTreeOpen = showFileTree && treeVisible");
    expect(scaffold).toContain("{showFileTree ? (");
    expect(scaffold).toContain("PanelLeft");
    expect(scaffold).toContain("{fileTreeOpen ? (");
  });

  test("Changes hides the in-pane tree when the explorer sidecar toggle is present", () => {
    expect(changes).toContain("showFileTree={!showChangesExplorerToggle}");
    expect(changes).toContain("compactToolbar={showChangesExplorerToggle}");
  });

  test("Review and PR keep the default in-pane file tree", () => {
    expect(review).toContain("<DiffCodeViewScaffold");
    expect(review).not.toContain("showFileTree=");
    expect(prFiles).toContain("<DiffCodeViewScaffold");
    expect(prFiles).not.toContain("showFileTree=");
  });
});
