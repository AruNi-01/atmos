import { describe, expect, test } from "bun:test";
import { CancelledError } from "@tanstack/react-query";
import { isCancelledError } from "./is-cancelled-error";

describe("isCancelledError", () => {
  test("detects TanStack CancelledError instances", () => {
    expect(isCancelledError(new CancelledError())).toBe(true);
  });

  test("detects AbortError by name", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    expect(isCancelledError(error)).toBe(true);
  });

  test("detects aborted signals by message when name is mangled", () => {
    const error = new Error("signal is aborted without reason");
    error.name = "c";
    expect(isCancelledError(error)).toBe(true);
  });

  test("detects minified CancelledError by message", () => {
    const error = new Error("CancelledError");
    error.name = "c";
    expect(isCancelledError(error)).toBe(true);
  });

  test("rejects unrelated errors", () => {
    expect(isCancelledError(new Error("network failed"))).toBe(false);
    expect(isCancelledError(null)).toBe(false);
    expect(isCancelledError("CancelledError")).toBe(false);
  });
});
