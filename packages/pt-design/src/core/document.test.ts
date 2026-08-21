import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILE_FORMAT, initDesignDocument, openDesignDocument, saveDesignDocument } from "./document";

function tmpDoc() {
  return join(mkdtempSync(join(tmpdir(), "pt-doc-")), "app.ptdesign.json");
}

describe("design document save", () => {
  test("sequential saves increment revision and leave valid JSON", () => {
    const path = tmpDoc();
    initDesignDocument(path);
    const first = openDesignDocument(path);
    const second = saveDesignDocument(path, first);
    const third = saveDesignDocument(path, second);
    const loaded = openDesignDocument(path);
    expect(loaded.format).toBe(FILE_FORMAT);
    expect(loaded.revision).toBe(third.revision);
    expect(third.revision).toBe(second.revision + 1);
    expect(second.revision).toBe(first.revision + 1);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(third.revision);
    const leftovers = readdirSync(join(path, "..")).filter((name) => name.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });
});
