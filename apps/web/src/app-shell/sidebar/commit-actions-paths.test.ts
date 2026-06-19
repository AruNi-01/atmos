import { describe, expect, it } from "bun:test";

import { basenameFromPath } from "./commit-actions-paths";

describe("basenameFromPath", () => {
  it("returns the final segment for POSIX paths", () => {
    expect(basenameFromPath("/Users/aarynlu/OpenSource/atmos")).toBe("atmos");
  });

  it("returns the final segment for Windows paths", () => {
    expect(basenameFromPath("C:\\Users\\aarynlu\\OpenSource\\atmos")).toBe("atmos");
  });

  it("ignores trailing separators", () => {
    expect(basenameFromPath("C:\\Users\\aarynlu\\OpenSource\\atmos\\")).toBe("atmos");
    expect(basenameFromPath("/Users/aarynlu/OpenSource/atmos/")).toBe("atmos");
  });

  it("returns undefined for blank paths", () => {
    expect(basenameFromPath("   ")).toBeUndefined();
    expect(basenameFromPath(null)).toBeUndefined();
  });
});
