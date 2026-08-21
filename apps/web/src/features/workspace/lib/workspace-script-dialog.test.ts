import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  countScriptLines,
  insertTokenAtSelection,
  phaseStatus,
  scriptsAreDirty,
} from "./workspace-script-dialog";

describe("scriptsAreDirty", () => {
  test("is clean before the initial snapshot exists", () => {
    expect(
      scriptsAreDirty({ setup: "npm i", run: "", purge: "" }, null),
    ).toBe(false);
  });

  test("detects any phase change", () => {
    const initial = { setup: "npm i", run: "npm run dev", purge: "" };
    expect(scriptsAreDirty(initial, initial)).toBe(false);
    expect(scriptsAreDirty({ ...initial, run: "pnpm dev" }, initial)).toBe(true);
  });
});

describe("phaseStatus", () => {
  test("marks empty, set, and edited phases", () => {
    expect(phaseStatus("", "")).toBe("empty");
    expect(phaseStatus("npm i", "npm i")).toBe("set");
    expect(phaseStatus("npm i", "")).toBe("edited");
    expect(phaseStatus("", "npm i")).toBe("edited");
  });
});

describe("countScriptLines", () => {
  test("counts visible lines and ignores a trailing newline", () => {
    expect(countScriptLines("")).toBe(0);
    expect(countScriptLines("npm i")).toBe(1);
    expect(countScriptLines("npm i\n")).toBe(1);
    expect(countScriptLines("npm i\npnpm dev")).toBe(2);
  });
});

describe("insertTokenAtSelection", () => {
  test("replaces the current selection", () => {
    expect(insertTokenAtSelection("echo $OLD", 5, 9, "$ATMOS_WORKSPACE_NAME")).toEqual({
      value: "echo $ATMOS_WORKSPACE_NAME",
      caret: 26,
    });
  });

  test("adds spacing so the token stays a standalone word", () => {
    expect(insertTokenAtSelection("cp&&", 2, 2, "$ATMOS_WORKSPACE_PATH")).toEqual({
      value: "cp $ATMOS_WORKSPACE_PATH &&",
      caret: 25,
    });
  });
});

describe("WorkspaceScriptDialog source", () => {
  test("does not use inverted white env-var text", () => {
    const source = readFileSync(
      join(import.meta.dir, "../components/WorkspaceScriptDialog.tsx"),
      "utf8",
    );
    expect(source).not.toContain("text-white");
    expect(source).toContain("data-script-phase");
    expect(source).toContain("data-env-var");
    expect(source).toContain('language="shell"');
    expect(source).toContain("BaseCodeMirrorEditor");
    expect(source).toContain("trustHint");
    expect(source).not.toContain('t("description")');
    expect(source).not.toContain("env.note");
  });
});
