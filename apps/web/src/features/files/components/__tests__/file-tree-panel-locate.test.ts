import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("FileTreePanel locate current file", () => {
  const panel = readFileSync(
    join(import.meta.dir, "../FileTreePanel.tsx"),
    "utf8",
  );
  const row = readFileSync(
    join(import.meta.dir, "../FileTreeRow.tsx"),
    "utf8",
  );
  const tree = readFileSync(
    join(import.meta.dir, "../FileTree.tsx"),
    "utf8",
  );

  it("puts a Crosshair control after the project name that requests a tree reveal", () => {
    expect(panel).toContain("Crosshair");
    expect(panel).toContain('data-file-tree-locate=""');
    expect(panel).toContain("requestFileTreeReveal");
    expect(panel).toContain("locateCurrentFile");
    expect(panel).toContain("canLocateActiveFile");
    // Sits with the project name, not only in the trailing action cluster.
    const nameBlock = panel.indexOf("{projectName}");
    const locateAttr = panel.indexOf('data-file-tree-locate=""');
    const eyeToggle = panel.indexOf("showHiddenFiles");
    expect(nameBlock).toBeGreaterThan(-1);
    expect(locateAttr).toBeGreaterThan(nameBlock);
    expect(eyeToggle).toBeGreaterThan(locateAttr);
  });

  it("flashes the revealed row even when it is already the active file", () => {
    expect(row).toContain("isHighlighted");
    expect(row).not.toContain("isHighlighted && !isActive");
    expect(row).toContain("animate-pulse");
  });

  it("consumes reveal once without depending on loadDirectoryChildren/tree identity", () => {
    // loadDirectoryChildren updates lazyItemsMap; if it (or `tree`) sits in the
    // reveal effect deps, expand/load re-fires the effect forever.
    expect(tree).toContain("loadDirectoryChildrenRef");
    expect(tree).toContain("treeRef");
    expect(tree).toContain("clearFileTreeRevealTarget(target.requestId)");

    const revealEffectStart = tree.indexOf(
      "Keep those behind refs so this effect only runs once per reveal request.",
    );
    expect(revealEffectStart).toBeGreaterThan(-1);
    const revealEffectBlock = tree.slice(
      revealEffectStart,
      revealEffectStart + 3500,
    );
    const depsClose = revealEffectBlock.indexOf("revealEnabled,");
    expect(depsClose).toBeGreaterThan(-1);
    const depsTail = revealEffectBlock.slice(depsClose, depsClose + 80);
    expect(depsTail).toContain("revealEnabled,");
    expect(depsTail).not.toContain("loadDirectoryChildren");
    expect(depsTail).not.toMatch(/\btree\b/);

    // Full reveal-effect dependency list should omit unstable identities.
    expect(revealEffectBlock).toContain("fileTreeRevealTarget,");
    expect(revealEffectBlock).not.toContain(
      "loadDirectoryChildren,\n    revealEnabled",
    );
    expect(revealEffectBlock).not.toContain("revealEnabled,\n    tree,");

    // resolveItem must not close over lazyItemsMap or each listDir write
    // recreates loadDirectoryChildren and can still thrash other callers.
    expect(tree).toContain("knownItemsRef.current.items.get(itemId)");
    expect(tree).not.toContain("lazyItemsMap.get(itemId)");
  });
});
