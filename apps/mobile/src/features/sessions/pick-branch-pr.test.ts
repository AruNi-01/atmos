// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { pickBranchPr, pickBranchPrFromLookup, type BranchPrLike } from "./pick-branch-pr";

const prs: BranchPrLike[] = [
  { number: 2, head_ref: "feat/a", state: "open", is_draft: false },
  { number: 8, head_ref: "feat/a", state: "open", is_draft: true },
  { number: 11, head_ref: "feat/b", state: "open", is_draft: false },
];

describe("pickBranchPr", () => {
  test("picks the highest matching head and uses draft when that PR is a draft", () => {
    expect(pickBranchPr(prs, "feat/a")).toEqual({ number: 8, prState: "draft" });
  });

  test("reads headRefName and isDraft from the GitHub list payload", () => {
    expect(
      pickBranchPr(
        [{ number: 3, headRefName: "refs/heads/feat/a", state: "OPEN", isDraft: false }],
        "feat/a",
      ),
    ).toEqual({ number: 3, prState: "open" });
  });

  test("returns null for an empty list or a failed lookup", () => {
    expect(pickBranchPr([], "feat/a")).toBeNull();
    expect(pickBranchPr(null, "feat/a")).toBeNull();
    expect(pickBranchPrFromLookup({ error: new Error("github down"), prs }, "feat/a")).toBeNull();
    expect(pickBranchPrFromLookup(null, "feat/a")).toBeNull();
  });
});
