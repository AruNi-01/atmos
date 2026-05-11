/**
 * Tests for version comparison logic in use-updater.ts
 */

// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, it, expect } from "bun:test";
import { parseVersion, compareVersions } from "../use-updater";

describe("parseVersion", () => {
  it("parses stable version correctly", () => {
    const result = parseVersion("1.1.0");
    expect(result).toEqual({
      major: 1,
      minor: 1,
      patch: 0,
      prereleaseType: null,
      prereleaseNumber: null,
    });
  });

  it("parses rc version correctly", () => {
    const result = parseVersion("1.1.0-rc.5");
    expect(result).toEqual({
      major: 1,
      minor: 1,
      patch: 0,
      prereleaseType: "rc",
      prereleaseNumber: 5,
    });
  });

  it("parses beta version correctly", () => {
    const result = parseVersion("1.1.1-beta.1");
    expect(result).toEqual({
      major: 1,
      minor: 1,
      patch: 1,
      prereleaseType: "beta",
      prereleaseNumber: 1,
    });
  });

  it("parses alpha version correctly", () => {
    const result = parseVersion("2.0.0-alpha.10");
    expect(result).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
      prereleaseType: "alpha",
      prereleaseNumber: 10,
    });
  });

  it("removes desktop-v prefix", () => {
    const result = parseVersion("desktop-v1.1.0-rc.5");
    expect(result).toEqual({
      major: 1,
      minor: 1,
      patch: 0,
      prereleaseType: "rc",
      prereleaseNumber: 5,
    });
  });
});

describe("compareVersions", () => {
  describe("main version comparison", () => {
    it("major version takes priority", () => {
      expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
      expect(compareVersions("1.9.9", "2.0.0")).toBe(-1);
    });

    it("minor version takes priority when major is equal", () => {
      expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
      expect(compareVersions("1.1.9", "1.2.0")).toBe(-1);
    });

    it("patch version takes priority when major and minor are equal", () => {
      expect(compareVersions("1.1.5", "1.1.4")).toBe(1);
      expect(compareVersions("1.1.4", "1.1.5")).toBe(-1);
    });

    it("returns 0 for equal stable versions", () => {
      expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
    });
  });

  describe("prerelease type priority", () => {
    it("stable is greater than any prerelease with same main version", () => {
      expect(compareVersions("1.1.0", "1.1.0-rc.10")).toBe(1);
      expect(compareVersions("1.1.0", "1.1.0-beta.10")).toBe(1);
      expect(compareVersions("1.1.0", "1.1.0-alpha.10")).toBe(1);
    });

    it("rc is greater than beta with same main version", () => {
      expect(compareVersions("1.1.0-rc.1", "1.1.0-beta.10")).toBe(1);
      expect(compareVersions("1.1.0-beta.10", "1.1.0-rc.1")).toBe(-1);
    });

    it("beta is greater than alpha with same main version", () => {
      expect(compareVersions("1.1.0-beta.1", "1.1.0-alpha.10")).toBe(1);
      expect(compareVersions("1.1.0-alpha.10", "1.1.0-beta.1")).toBe(-1);
    });
  });

  describe("prerelease number comparison", () => {
    it("compares rc numbers correctly", () => {
      expect(compareVersions("1.1.0-rc.5", "1.1.0-rc.4")).toBe(1);
      expect(compareVersions("1.1.0-rc.4", "1.1.0-rc.5")).toBe(-1);
      expect(compareVersions("1.1.0-rc.5", "1.1.0-rc.5")).toBe(0);
    });

    it("compares beta numbers correctly", () => {
      expect(compareVersions("1.1.0-beta.10", "1.1.0-beta.9")).toBe(1);
      expect(compareVersions("1.1.0-beta.9", "1.1.0-beta.10")).toBe(-1);
    });

    it("compares alpha numbers correctly", () => {
      expect(compareVersions("1.1.0-alpha.3", "1.1.0-alpha.2")).toBe(1);
      expect(compareVersions("1.1.0-alpha.2", "1.1.0-alpha.3")).toBe(-1);
    });
  });

  describe("cross-main-version prerelease comparison", () => {
    it("rc.1 of higher main version is greater than rc.10 of lower main version", () => {
      expect(compareVersions("1.1.1-rc.1", "1.1.0-rc.10")).toBe(1);
      expect(compareVersions("1.1.0-rc.10", "1.1.1-rc.1")).toBe(-1);
    });

    it("beta.1 of higher main version is greater than beta.10 of lower main version", () => {
      expect(compareVersions("1.1.1-beta.1", "1.1.0-beta.10")).toBe(1);
      expect(compareVersions("1.1.0-beta.10", "1.1.1-beta.1")).toBe(-1);
    });

    it("higher main version rc is greater than lower main version beta", () => {
      expect(compareVersions("1.1.1-rc.1", "1.1.0-beta.10")).toBe(1);
      expect(compareVersions("1.1.0-beta.10", "1.1.1-rc.1")).toBe(-1);
    });
  });

  describe("real-world scenarios", () => {
    it("handles the user's requested scenario: 1.1.0-rc.5 -> 1.1.1-rc.1", () => {
      expect(compareVersions("1.1.1-rc.1", "1.1.0-rc.5")).toBe(1);
      expect(compareVersions("1.1.0-rc.5", "1.1.1-rc.1")).toBe(-1);
    });

    it("handles beta cross-version: 1.1.0-beta.5 -> 1.1.1-beta.1", () => {
      expect(compareVersions("1.1.1-beta.1", "1.1.0-beta.5")).toBe(1);
      expect(compareVersions("1.1.0-beta.5", "1.1.1-beta.1")).toBe(-1);
    });

    it("handles rc to rc within same version: 1.1.0-rc.5 -> 1.1.0-rc.6", () => {
      expect(compareVersions("1.1.0-rc.6", "1.1.0-rc.5")).toBe(1);
      expect(compareVersions("1.1.0-rc.5", "1.1.0-rc.6")).toBe(-1);
    });

    it("handles stable upgrade: 1.0.0 -> 1.1.0", () => {
      expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    });

    it("handles patch upgrade: 1.1.0 -> 1.1.1", () => {
      expect(compareVersions("1.1.1", "1.1.0")).toBe(1);
      expect(compareVersions("1.1.0", "1.1.1")).toBe(-1);
    });

    it("desktop-v prefix doesn't affect comparison", () => {
      expect(compareVersions("desktop-v1.1.1-rc.1", "1.1.0-rc.5")).toBe(1);
      expect(compareVersions("1.1.0-rc.5", "desktop-v1.1.1-rc.1")).toBe(-1);
    });
  });

  describe("edge cases", () => {
    it("handles very large version numbers", () => {
      expect(compareVersions("10.0.0", "9.9.9")).toBe(1);
      expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
      expect(compareVersions("1.1.10", "1.1.9")).toBe(1);
    });

    it("handles single-digit versions", () => {
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.0-rc.1", "1.0.0-alpha.1")).toBe(1);
    });

    it("handles equal prerelease versions", () => {
      expect(compareVersions("1.1.0-rc.5", "1.1.0-rc.5")).toBe(0);
      expect(compareVersions("desktop-v1.1.0-rc.5", "1.1.0-rc.5")).toBe(0);
    });
  });
});
