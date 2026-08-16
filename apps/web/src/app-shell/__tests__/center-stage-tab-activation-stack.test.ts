import { beforeEach, describe, expect, test } from "bun:test";
import {
  buildOpenCenterTabValues,
  getCenterTabActivationStack,
  pickNextCenterTabFromActivationStack,
  recordCenterTabActivation,
  removeCenterTabFromActivationStack,
  resetCenterTabActivationStacksForTests,
} from "@/app-shell/center-stage-tab-activation-stack";

describe("center-stage-tab-activation-stack", () => {
  beforeEach(() => {
    resetCenterTabActivationStacksForTests();
  });

  test("records activations in MRU order and dedupes", () => {
    recordCenterTabActivation("ws-1", "a");
    recordCenterTabActivation("ws-1", "b");
    recordCenterTabActivation("ws-1", "c");
    recordCenterTabActivation("ws-1", "b");
    expect(getCenterTabActivationStack("ws-1")).toEqual(["b", "c", "a"]);
  });

  test("isolates stacks per context", () => {
    recordCenterTabActivation("ws-1", "a");
    recordCenterTabActivation("ws-2", "x");
    expect(getCenterTabActivationStack("ws-1")).toEqual(["a"]);
    expect(getCenterTabActivationStack("ws-2")).toEqual(["x"]);
  });

  test("pickNext returns most recent still-open tab and prunes closed ones", () => {
    recordCenterTabActivation("ws-1", "file/a.ts");
    recordCenterTabActivation("ws-1", "terminal");
    recordCenterTabActivation("ws-1", "file/b.ts");
    // Close b → should go back to terminal
    removeCenterTabFromActivationStack("ws-1", "file/b.ts");
    const open = new Set(["file/a.ts", "terminal", "overview"]);
    expect(pickNextCenterTabFromActivationStack("ws-1", open)).toBe("terminal");
    expect(getCenterTabActivationStack("ws-1")).toEqual([
      "terminal",
      "file/a.ts",
    ]);
  });

  test("pickNext skips closed entries until a live one", () => {
    recordCenterTabActivation("ws-1", "a");
    recordCenterTabActivation("ws-1", "b");
    recordCenterTabActivation("ws-1", "c");
    // c closed; b also closed; a still open
    const open = new Set(["a", "overview"]);
    expect(pickNextCenterTabFromActivationStack("ws-1", open)).toBe("a");
    expect(getCenterTabActivationStack("ws-1")).toEqual(["a"]);
  });

  test("pickNext returns null when no stack entry is still open", () => {
    recordCenterTabActivation("ws-1", "a");
    // "a" is closed; overview is open but was never activated → null (caller falls back)
    expect(
      pickNextCenterTabFromActivationStack("ws-1", new Set(["overview"])),
    ).toBeNull();
    expect(getCenterTabActivationStack("ws-1")).toEqual([]);
  });

  test("pickNext can return overview when it was previously activated", () => {
    recordCenterTabActivation("ws-1", "overview");
    recordCenterTabActivation("ws-1", "a");
    removeCenterTabFromActivationStack("ws-1", "a");
    expect(
      pickNextCenterTabFromActivationStack("ws-1", new Set(["overview"])),
    ).toBe("overview");
  });

  test("remove drops a single entry", () => {
    recordCenterTabActivation("ws-1", "a");
    recordCenterTabActivation("ws-1", "b");
    removeCenterTabFromActivationStack("ws-1", "a");
    expect(getCenterTabActivationStack("ws-1")).toEqual(["b"]);
  });

  test("buildOpenCenterTabValues includes surfaces and applies exclude", () => {
    const open = buildOpenCenterTabValues({
      openFilePaths: ["/a.ts", "/b.ts"],
      terminalTabIds: ["terminal", "term-2"],
      githubTabValues: ["github-pr:1"],
      browserTabValues: ["browser:x"],
      projectWikiVisible: true,
      codeReviewVisible: false,
      simulatorVisible: true,
      gitHistoryVisible: true,
      changesVisible: true,
      reviewVisible: true,
      runVisible: false,
      githubHubVisible: true,
      filesVisible: true,
      wikiEnabled: true,
      exclude: ["/b.ts", "term-2"],
    });
    expect(open.has("overview")).toBe(true);
    expect(open.has("wiki")).toBe(true);
    expect(open.has("project-wiki")).toBe(true);
    expect(open.has("code-review")).toBe(false);
    expect(open.has("simulator")).toBe(true);
    expect(open.has("git-history")).toBe(true);
    expect(open.has("changes")).toBe(true);
    expect(open.has("review")).toBe(true);
    expect(open.has("run")).toBe(false);
    expect(open.has("github")).toBe(true);
    expect(open.has("files")).toBe(true);
    expect(open.has("/a.ts")).toBe(true);
    expect(open.has("/b.ts")).toBe(false);
    expect(open.has("terminal")).toBe(true);
    expect(open.has("term-2")).toBe(false);
    expect(open.has("github-pr:1")).toBe(true);
    expect(open.has("browser:x")).toBe(true);
  });
});
