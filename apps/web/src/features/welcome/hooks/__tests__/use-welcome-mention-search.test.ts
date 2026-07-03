// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { filterMentionFileCandidates } from "@/features/welcome/lib/mention-file-search";
import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";

function candidate(
  relativePath: string,
  overrides: Partial<MentionFileCandidate> = {},
): MentionFileCandidate {
  const name = relativePath.split("/").pop() || relativePath;
  return {
    name,
    relativePath,
    isDir: false,
    isHidden: false,
    ...overrides,
  };
}

describe("filterMentionFileCandidates", () => {
  const entries: MentionFileCandidate[] = [
    candidate("pages", { isDir: true }),
    candidate("pages/script.ts"),
    candidate("pages/styles.css"),
    candidate("pages/sub/script-helper.ts"),
    candidate("src/script.ts"),
  ];

  it("lists files under the typed directory when the query ends with a slash", () => {
    expect(filterMentionFileCandidates(entries, "pages/").map((item) => item.relativePath))
      .toEqual([
        "pages/script.ts",
        "pages/styles.css",
        "pages/sub/script-helper.ts",
      ]);
  });

  it("searches only inside the directory before the last slash", () => {
    const paths = filterMentionFileCandidates(entries, "pages/script").map(
      (item) => item.relativePath,
    );

    expect(paths).toContain("pages/script.ts");
    expect(paths).toContain("pages/sub/script-helper.ts");
    expect(paths).not.toContain("src/script.ts");
  });
});
