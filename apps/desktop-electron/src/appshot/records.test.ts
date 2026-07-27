import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  appshotRecordsDirForTest,
  deleteRecord,
  listRecords,
  writeTestRecord,
} from "./service.ts";

const testTs = `test-${Date.now()}`;

afterEach(async () => {
  try {
    await deleteRecord(testTs);
  } catch {
    /* ignore */
  }
});

describe("appshot records (real fs)", () => {
  it("writes, lists, and deletes a record dir", async () => {
    writeTestRecord(testTs, "unit");
    const dir = join(appshotRecordsDirForTest(), testTs);
    expect(existsSync(join(dir, "metadata.json"))).toBe(true);
    const list = await listRecords();
    const item = list.find((r) => r.timestamp === testTs);
    expect(item?.record_dir).toBe(dir);
    await deleteRecord(testTs);
    expect(existsSync(dir)).toBe(false);
  });
});
