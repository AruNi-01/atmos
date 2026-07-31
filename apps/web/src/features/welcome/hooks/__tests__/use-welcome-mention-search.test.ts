// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  filterMentionFileCandidates,
  MENTION_CONTAINS_RESERVE,
  MENTION_FILE_RESULT_LIMIT,
  splitHighlightParts,
} from "@/features/welcome/lib/mention-file-search";
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
    candidate("apps/desktop-electron/native/appshot-shift/appshot_shift.c"),
    candidate("apps/desktop-electron/resources/bin/libatmos_appshot_shift.dylib"),
    candidate("apps/desktop-electron/resources/runtime/__next._full.txt"),
    candidate("apps/desktop-electron/resources/runtime/__next.appshot-permissions.txt"),
    candidate(".github/workflows/appshot.yml", { isHidden: true }),
    candidate(".appshot-config", { isHidden: true }),
    candidate("docs/unrelated.md"),
    candidate("zz_end_appshot"),
  ];

  it("lists files under the typed directory when the query ends with a slash", () => {
    expect(filterMentionFileCandidates(entries, "pages/").map((item) => item.relativePath))
      .toEqual([
        "pages/script.ts",
        "pages/styles.css",
        "pages/sub/script-helper.ts",
      ]);
  });

  it("searches only inside the directory before the last slash, matching names", () => {
    const paths = filterMentionFileCandidates(entries, "pages/script").map(
      (item) => item.relativePath,
    );

    expect(paths).toContain("pages/script.ts");
    expect(paths).toContain("pages/sub/script-helper.ts");
    expect(paths).not.toContain("src/script.ts");
  });

  it("matches names with left and right free (`*query*`), not only prefixes", () => {
    const names = filterMentionFileCandidates(entries, "appshot").map((item) => item.name);

    // prefix
    expect(names).toContain("appshot_shift.c");
    expect(names).toContain("appshot.yml");
    // left free (suffix / mid)
    expect(names).toContain("libatmos_appshot_shift.dylib");
    expect(names).toContain("__next.appshot-permissions.txt");
    expect(names).toContain("zz_end_appshot");
    expect(names).toContain(".appshot-config");
    // path-only noise must not match
    expect(names).not.toContain("__next._full.txt");
    expect(names).not.toContain("unrelated.md");
  });

  it(`caps results at MENTION_FILE_RESULT_LIMIT (${MENTION_FILE_RESULT_LIMIT}) while keeping contains hits`, () => {
    const crowded: MentionFileCandidate[] = [];
    // More prefix hits than the cap so slice/reserve logic is actually exercised.
    for (let i = 0; i < MENTION_FILE_RESULT_LIMIT + 20; i++) {
      crowded.push(candidate(`prefix/appshot_file_${i}.ts`));
    }
    crowded.push(candidate("bin/libatmos_appshot_shift.dylib"));
    crowded.push(candidate("misc/zz_end_appshot"));
    crowded.push(candidate("nested/my_appshot_helper.ts"));
    crowded.push(candidate("docs/unrelated.md"));

    const names = filterMentionFileCandidates(crowded, "appshot").map((item) => item.name);

    expect(names).toHaveLength(MENTION_FILE_RESULT_LIMIT);
    // Prefix matches still lead the list.
    expect(names[0]?.startsWith("appshot_")).toBe(true);
    // But naive prefix-only slice must not hide mid/suffix contains matches.
    const containsHits = names.filter((name) => !name.startsWith("appshot"));
    expect(containsHits.length).toBeGreaterThanOrEqual(
      Math.min(MENTION_CONTAINS_RESERVE, 3),
    );
    expect(names).toContain("libatmos_appshot_shift.dylib");
    expect(names).toContain("zz_end_appshot");
    expect(names).not.toContain("unrelated.md");
  });

  it("is case-insensitive", () => {
    const names = filterMentionFileCandidates(entries, "AppShot").map((item) => item.name);
    expect(names).toContain("appshot_shift.c");
    expect(names).toContain("libatmos_appshot_shift.dylib");
  });

  it("ranks exact/prefix before mid-string contains", () => {
    const names = filterMentionFileCandidates(entries, "appshot").map((item) => item.name);
    const prefixIdx = names.indexOf("appshot_shift.c");
    const midIdx = names.indexOf("libatmos_appshot_shift.dylib");
    expect(prefixIdx).toBeGreaterThanOrEqual(0);
    expect(midIdx).toBeGreaterThanOrEqual(0);
    expect(prefixIdx).toBeLessThan(midIdx);
  });
});

describe("splitHighlightParts", () => {
  it("returns the full string when query is empty", () => {
    expect(splitHighlightParts("appshot_shift.c", "")).toEqual([
      { text: "appshot_shift.c", match: false },
    ]);
  });

  it("highlights mid-string matches so left/right free matching is visible", () => {
    expect(splitHighlightParts("libatmos_appshot_shift.dylib", "AppShot")).toEqual([
      { text: "libatmos_", match: false },
      { text: "appshot", match: true },
      { text: "_shift.dylib", match: false },
    ]);
  });

  it("handles multiple matches in one name", () => {
    expect(splitHighlightParts("foo-foo-bar", "foo")).toEqual([
      { text: "foo", match: true },
      { text: "-", match: false },
      { text: "foo", match: true },
      { text: "-bar", match: false },
    ]);
  });
});
