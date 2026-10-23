// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  bucketCandidateSessionKey,
  bucketCandidateStaleTime,
  shouldLoadBucketCandidates,
} from "./use-bucket-candidate-load";

describe("bucket candidate load", () => {
  test("home and an empty or not-ready bucket do not load", () => {
    expect(shouldLoadBucketCandidates({ isBucket: false, ready: true, sessionKey: "term-a" })).toBe(
      false,
    );
    expect(shouldLoadBucketCandidates({ isBucket: true, ready: true, sessionKey: "" })).toBe(false);
    expect(shouldLoadBucketCandidates({ isBucket: true, ready: false, sessionKey: "term-a" })).toBe(
      false,
    );
    expect(shouldLoadBucketCandidates({ isBucket: true, ready: true, sessionKey: "term-a" })).toBe(
      true,
    );
  });

  test("the session key is the sorted id set, and home stays empty", () => {
    expect(bucketCandidateSessionKey(false, ["b", "a"])).toBe("");
    expect(bucketCandidateSessionKey(true, [])).toBe("");
    expect(bucketCandidateSessionKey(true, ["b", "", "a"])).toBe("a\nb");
  });

  test("a changed session set bypasses the fresh window", () => {
    expect(
      bucketCandidateStaleTime({ freshMs: 60_000, previousSessionKey: "", sessionKey: "a" }),
    ).toBe(60_000);
    expect(
      bucketCandidateStaleTime({ freshMs: 60_000, previousSessionKey: "a", sessionKey: "a" }),
    ).toBe(60_000);
    expect(
      bucketCandidateStaleTime({
        freshMs: 60_000,
        previousSessionKey: "a",
        sessionKey: "a\nb",
      }),
    ).toBe(0);
  });
});
