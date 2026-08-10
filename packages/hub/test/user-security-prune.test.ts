import { describe, expect, test } from "bun:test";
import { MAX_USER_SESSIONS } from "../src/user-security";

describe("session cap", () => {
  test("max concurrent sessions is 10", () => {
    expect(MAX_USER_SESSIONS).toBe(10);
  });
});
