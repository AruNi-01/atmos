import { describe, expect, test } from "bun:test";
import BananaSlug from "github-slugger";
import { commonmark, syncHeadingIdPlugin } from "@milkdown/kit/preset/commonmark";
import { mdLiveCommonmark, slugMdLiveHeading } from "./heading-id";

describe("slugMdLiveHeading", () => {
  test("uses github-slugger including CJK punctuation", () => {
    expect(slugMdLiveHeading("后续优化:")).toBe(new BananaSlug().slug("后续优化:"));
    expect(slugMdLiveHeading("后续优化:")).not.toBe("后续优化:");
  });
});

describe("mdLiveCommonmark", () => {
  test("drops Milkdown live heading-id sync so IME can keep the heading node", () => {
    expect(commonmark).toContain(syncHeadingIdPlugin);
    expect(mdLiveCommonmark).not.toContain(syncHeadingIdPlugin);
    expect(mdLiveCommonmark.length).toBe(commonmark.length - 1);
  });
});
