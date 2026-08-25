import { describe, expect, test } from "bun:test";

import {
  REVENUE_LINES_AUTO_HEADROOM,
  clampToDomain,
  isFixedDomainMax,
  resolveDomainMax,
  resolveFixedDomainMax,
} from "./domain";

describe("isFixedDomainMax", () => {
  test("accepts a finite positive max", () => {
    expect(isFixedDomainMax(1)).toBe(true);
    expect(isFixedDomainMax(100)).toBe(true);
  });

  test("rejects undefined and invalid values", () => {
    expect(isFixedDomainMax(undefined)).toBe(false);
    expect(isFixedDomainMax(0)).toBe(false);
    expect(isFixedDomainMax(-10)).toBe(false);
    expect(isFixedDomainMax(Number.NaN)).toBe(false);
    expect(isFixedDomainMax(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFixedDomainMax(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

describe("resolveFixedDomainMax", () => {
  test("uses yMax when valid and otherwise keeps the auto max", () => {
    expect(resolveFixedDomainMax(100, 53)).toBe(100);
    expect(resolveFixedDomainMax(undefined, 53)).toBe(53);
    expect(resolveFixedDomainMax(0, 53)).toBe(53);
    expect(resolveFixedDomainMax(Number.NaN, 53)).toBe(53);
  });
});

describe("resolveDomainMax", () => {
  test("undefined uses data peak × 1.2 with a floor of 1", () => {
    expect(resolveDomainMax(undefined, 50)).toBe(50 * REVENUE_LINES_AUTO_HEADROOM);
    expect(resolveDomainMax(undefined, 0)).toBe(1 * REVENUE_LINES_AUTO_HEADROOM);
    expect(resolveDomainMax(undefined, 0.4)).toBe(1 * REVENUE_LINES_AUTO_HEADROOM);
  });

  test("invalid yMax falls back to the auto domain", () => {
    expect(resolveDomainMax(0, 40)).toBe(40 * REVENUE_LINES_AUTO_HEADROOM);
    expect(resolveDomainMax(-5, 40)).toBe(40 * REVENUE_LINES_AUTO_HEADROOM);
    expect(resolveDomainMax(Number.NaN, 40)).toBe(40 * REVENUE_LINES_AUTO_HEADROOM);
    expect(resolveDomainMax(Number.POSITIVE_INFINITY, 40)).toBe(
      40 * REVENUE_LINES_AUTO_HEADROOM,
    );
  });

  test("fixed yMax replaces the data peak and skips headroom", () => {
    expect(resolveDomainMax(100, 10)).toBe(100);
    expect(resolveDomainMax(1, 80)).toBe(1);
  });
});

describe("clampToDomain", () => {
  test("undefined / invalid yMax leave values unchanged", () => {
    expect(clampToDomain(120, undefined)).toBe(120);
    expect(clampToDomain(-4, undefined)).toBe(-4);
    expect(clampToDomain(120, 0)).toBe(120);
    expect(clampToDomain(120, Number.NaN)).toBe(120);
  });

  test("fixed yMax clamps plotted points to 0..yMax", () => {
    expect(clampToDomain(80, 100)).toBe(80);
    expect(clampToDomain(0, 100)).toBe(0);
    expect(clampToDomain(100, 100)).toBe(100);
    expect(clampToDomain(140, 100)).toBe(100);
    expect(clampToDomain(-8, 100)).toBe(0);
  });
});
