import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

describe("APP-074 git blame query identity", () => {
  test("S17 blame key is file-scoped and does not include hover SHA", () => {
    const blameKey = queryKeys.computer.gitFileBlame(scope, "/repo", "src/a.ts");
    const otherFile = queryKeys.computer.gitFileBlame(scope, "/repo", "src/b.ts");
    const detailKey = queryKeys.computer.gitCommitDetail(scope, "/repo", "abcdef1");

    expect(blameKey).toContain("fileBlame");
    expect(blameKey).toContain("src/a.ts");
    expect(JSON.stringify(blameKey)).not.toContain("abcdef1");
    expect(JSON.stringify(blameKey)).not.toContain("hover");
    expect(otherFile).not.toEqual(blameKey);
    expect(detailKey).toContain("commitDetail");
    expect(detailKey).toContain("abcdef1");
  });

  test("S4 detail query stays disabled without a SHA", () => {
    const options = readFileSync(
      join(import.meta.dir, "../git-query-options.ts"),
      "utf8",
    );
    expect(options).toContain(
      "enabled: (options?.enabled ?? true) && Boolean(repoPath) && Boolean(commitHash)",
    );
    expect(options).toContain("gitApi.getFileBlame(repoPath, filePath)");
    expect(options).not.toMatch(/gitFileBlame\([^)]*hover/);
  });
});
