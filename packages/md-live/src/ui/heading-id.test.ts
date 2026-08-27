import { describe, expect, test } from "bun:test";
import BananaSlug from "github-slugger";
import { slugMdLiveHeading } from "./heading-id";

describe("slugMdLiveHeading", () => {
  test("uses github-slugger including CJK punctuation", () => {
    expect(slugMdLiveHeading("后续优化:")).toBe(new BananaSlug().slug("后续优化:"));
    expect(slugMdLiveHeading("后续优化:")).not.toBe("后续优化:");
  });
});
