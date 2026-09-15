import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PtDesignError } from "../protocol";
import { createHeadlessSession } from "./headless-session";

const LEGAL_PTX = `<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
  </select>
  <button id="run" label="Run" x="300" y="260" width="100" height="40"/>
</page>
`;

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "pt-headless-"));
}

function expectCode(fn: () => unknown, code: string): PtDesignError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PtDesignError);
    const err = error as PtDesignError;
    expect(err.code).toBe(code);
    return err;
  }
  throw new Error(`expected PtDesignError ${code}`);
}

describe("headless PTX session", () => {
  test("empty session serializes a page; applyPtx updates option and button", () => {
    const session = createHeadlessSession();
    const empty = session.getPtx();
    expect(empty).toContain("<page");
    expect(empty).toBe(session.getPtx());
    expect(session.getDocument()).toEqual({
      version: "ptx/1",
      pages: [{ id: "page", nodes: [] }],
    });

    session.applyPtx(LEGAL_PTX);
    const xml = session.getPtx();
    expect(xml).toContain("<option");
    expect(xml).toContain("<button");
    expect(xml).toContain('value="gpt-5.6"');
    expect(session.getDocument().pages[0]!.id).toBe("model-config");
    expect(session.getDocument().pages[0]!.nodes.map((n) => n.id)).toEqual(["model", "run"]);
  });

  test("S16 PTX without canvas.json still opens", () => {
    const dir = tmpDir();
    const session = createHeadlessSession({ ptx: LEGAL_PTX });
    session.saveDir(dir);
    expect(existsSync(join(dir, "document.ptx"))).toBe(true);
    expect(existsSync(join(dir, "canvas.json"))).toBe(false);
    const opened = createHeadlessSession();
    opened.openDir(dir);
    expect(opened.getPtx()).toContain("<page");
    expect(opened.getDocument().pages[0]!.nodes.map((n) => n.id)).toEqual(["model", "run"]);
  });

  test("S7 invalid_option leaves the previous document unchanged", () => {
    const session = createHeadlessSession({ ptx: LEGAL_PTX });
    const before = session.getPtx();
    const beforeDoc = structuredClone(session.getDocument());
    expectCode(
      () =>
        session.applyPtx(
          `<page id="p"><select id="s" x="0" y="0" width="10" height="10"><option>Claude</option></select></page>`,
        ),
      "invalid_option",
    );
    expect(session.getPtx()).toBe(before);
    expect(session.getDocument()).toEqual(beforeDoc);
  });

  test("S13 applyPtx with a complete page succeeds; orphan snippet is invalid_ptx", () => {
    const session = createHeadlessSession({ ptx: LEGAL_PTX });
    const edited = session.getPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    session.applyPtx(edited);
    expect(session.getPtx()).toContain('value="deepseek"');
    const after = session.getPtx();
    expectCode(() => session.applyPtx(`<option value="x">X</option>`), "invalid_ptx");
    expect(session.getPtx()).toBe(after);
  });

  test("orphan option is invalid_ptx and leaves the previous document", () => {
    const session = createHeadlessSession();
    const before = session.getPtx();
    const beforeDoc = structuredClone(session.getDocument());
    expectCode(() => session.applyPtx(`<option value="x">X</option>`), "invalid_ptx");
    expect(session.getPtx()).toBe(before);
    expect(session.getDocument()).toEqual(beforeDoc);

    expectCode(() => createHeadlessSession({ ptx: `<option value="x">X</option>` }), "invalid_ptx");
  });

  test("saveDir writes document.ptx; openDir round-trips AST; missing file is missing_file", () => {
    const session = createHeadlessSession({ ptx: LEGAL_PTX });
    const dir = tmpDir();
    session.saveDir(dir);
    expect(existsSync(join(dir, "document.ptx"))).toBe(true);
    expect(readFileSync(join(dir, "document.ptx"), "utf8")).toBe(session.getPtx());

    const opened = createHeadlessSession();
    opened.openDir(dir);
    expect(opened.getDocument()).toEqual(session.getDocument());
    expect(opened.getPtx()).toBe(session.getPtx());

    const empty = createHeadlessSession();
    const before = empty.getPtx();
    expectCode(() => empty.openDir(tmpDir()), "missing_file");
    expect(empty.getPtx()).toBe(before);
  });

  test("S22 does not import @excalidraw/excalidraw", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "headless-session.ts"), "utf8");
    expect(src).not.toMatch(/@excalidraw\/excalidraw/);
  });
});
