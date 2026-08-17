import { describe, expect, test } from "bun:test";
import { createId, createInstanceId } from "./ids";

describe("ids", () => {
  test("default path uses crypto.randomUUID shape", () => {
    expect(createId("el")).toMatch(/^el_[0-9a-f]{16}$/);
    expect(createInstanceId()).toMatch(/^inst_[0-9a-f]{32}$/);
  });

  test("falls back when crypto.randomUUID is missing", () => {
    const cryptoObj = globalThis.crypto;
    const orig = cryptoObj.randomUUID.bind(cryptoObj);
    const descriptor = Object.getOwnPropertyDescriptor(cryptoObj, "randomUUID");
    Object.defineProperty(cryptoObj, "randomUUID", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      expect(createId("el")).toMatch(/^el_[0-9a-f]{16}$/);
      expect(createInstanceId()).toMatch(/^inst_[0-9a-f]{32}$/);
    } finally {
      if (descriptor) Object.defineProperty(cryptoObj, "randomUUID", descriptor);
      else cryptoObj.randomUUID = orig;
    }
  });
});
