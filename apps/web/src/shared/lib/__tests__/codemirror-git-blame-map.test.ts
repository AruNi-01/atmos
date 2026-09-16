import { describe, expect, test } from "bun:test";
import type { GitBlameRange } from "@/api/ws-api-types";
import {
  lookupBlameRange,
  remapBlameRangesForDoc,
} from "@/shared/lib/codemirror-git-blame-map";

const ranges: GitBlameRange[] = [
  { start_line: 1, end_line: 1, commit_hash: "aaa" },
  { start_line: 2, end_line: 2, commit_hash: "bbb" },
];

describe("APP-074 blame range lookup and dirty map", () => {
  test("lookup finds the range for a line", () => {
    expect(lookupBlameRange(ranges, 2)?.commit_hash).toBe("bbb");
    expect(lookupBlameRange(ranges, 9)).toBeNull();
  });

  test("S14 inserted line is uncommitted and shifted line keeps SHA", () => {
    const saved = "one\ntwo\n";
    const current = "one\nNEW\ntwo\n";
    const remapped = remapBlameRangesForDoc(ranges, saved, current);
    expect(lookupBlameRange(remapped, 1)?.commit_hash).toBe("aaa");
    expect(lookupBlameRange(remapped, 2)?.commit_hash).toBeNull();
    expect(lookupBlameRange(remapped, 3)?.commit_hash).toBe("bbb");
  });
});
