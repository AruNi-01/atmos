import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteRecord,
  listRecords,
  setTestAppshotsRoot,
  writeTestRecord,
} from "./service.ts";
import { CONTEXT_FILE, METADATA_FILE, SNAPSHOT_FILE } from "./paths.ts";

let testRoot: string;
const testTs = "1760000000888";

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "atmos-appshot-rec-"));
  setTestAppshotsRoot(testRoot);
});

afterEach(async () => {
  try {
    await deleteRecord(testTs);
  } catch {
    /* ignore */
  }
  setTestAppshotsRoot(null);
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("appshot records (real fs, Tauri layout)", () => {
  it("writes three-file layout under appshots/records", async () => {
    writeTestRecord(testTs, "layout", { withPng: true, appName: "Calendar" });
    const dir = join(testRoot, "records", testTs);
    expect(existsSync(join(dir, SNAPSHOT_FILE))).toBe(true);
    expect(existsSync(join(dir, CONTEXT_FILE))).toBe(true);
    expect(existsSync(join(dir, METADATA_FILE))).toBe(true);
    const ctx = readFileSync(join(dir, CONTEXT_FILE), "utf8");
    expect(ctx).toContain("Calendar");
    const meta = JSON.parse(readFileSync(join(dir, METADATA_FILE), "utf8"));
    expect(meta.app_name).toBe("Calendar");
    expect(meta.timestamp).toBe(testTs);

    const list = await listRecords();
    expect(list.some((r) => r.timestamp === testTs)).toBe(true);

    await deleteRecord(testTs);
    expect(existsSync(dir)).toBe(false);
  });
});
