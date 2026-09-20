import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PtDesignError } from "./error";
import { parsePtx, serializePtx } from "./index";
import { readBundle, writeBundle } from "./bundle";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "pt-bundle-"));
}

describe("S15 protocol bundle IO", () => {
  test("writeBundle writes document.ptx and canvas.json; readBundle round-trips", () => {
    const dir = tmpDir();
    const ptx = serializePtx(
      parsePtx(`<page id="p"><button id="run" label="Run" x="1" y="2" width="3" height="4"/></page>`),
    );
    const canvas = { appState: { zoom: 1 }, files: {} };
    writeBundle(dir, { ptx, canvas });
    expect(readFileSync(join(dir, "document.ptx"), "utf8")).toBe(ptx);
    expect(JSON.parse(readFileSync(join(dir, "canvas.json"), "utf8"))).toEqual(canvas);
    const loaded = readBundle(dir);
    expect(loaded.ptx).toBe(ptx);
    expect(loaded.canvas).toEqual(canvas);
  });

  test("omitting canvas does not write canvas.json", () => {
    const dir = tmpDir();
    writeBundle(dir, { ptx: `<page id="p"></page>\n` });
    expect(existsSync(join(dir, "document.ptx"))).toBe(true);
    expect(existsSync(join(dir, "canvas.json"))).toBe(false);
    expect(readBundle(dir)).toEqual({ ptx: `<page id="p"></page>\n` });
  });

  test("missing document.ptx is missing_file", () => {
    try {
      readBundle(tmpDir());
      throw new Error("expected missing_file");
    } catch (error) {
      expect(error).toBeInstanceOf(PtDesignError);
      expect((error as PtDesignError).code).toBe("missing_file");
    }
  });
});
