import { describe, expect, test } from "bun:test";
import {
  ACTIVITY_INDICATOR_GROUPS,
  ACTIVITY_INDICATOR_STYLES,
  ACTIVITY_STYLES_BY_GROUP,
  ActivityIndicatorGroup,
  isActivityIndicatorGroup,
  isActivityIndicatorStyle,
  isOrbIndicatorId,
  isUnicodeSpinnerId,
  pickActivityIndicatorStyle,
  stylesForGroups,
} from "./activity-indicator-catalog";

describe("activity indicator catalog", () => {
  test("groups cover unicode, every orb family, and stars", () => {
    expect(ACTIVITY_INDICATOR_GROUPS).toEqual([
      "unicode",
      "lattice",
      "lens",
      "ring",
      "helix",
      "morph",
      "stars",
    ]);
    expect(ACTIVITY_STYLES_BY_GROUP.stars).toEqual(["stars"]);
    expect(ACTIVITY_INDICATOR_STYLES).toHaveLength(
      ACTIVITY_INDICATOR_GROUPS.reduce(
        (sum, group) => sum + ACTIVITY_STYLES_BY_GROUP[group].length,
        0,
      ),
    );
  });

  test("omitted random pool expands to every style", () => {
    expect(stylesForGroups()).toEqual([...ACTIVITY_INDICATOR_STYLES]);
    expect(stylesForGroups([])).toEqual([...ACTIVITY_INDICATOR_STYLES]);
  });

  test("named groups expand only those families", () => {
    expect(
      stylesForGroups([
        ActivityIndicatorGroup.Lattice,
        ActivityIndicatorGroup.Ring,
        ActivityIndicatorGroup.Helix,
      ]),
    ).toEqual([
      ...ACTIVITY_STYLES_BY_GROUP.lattice,
      ...ACTIVITY_STYLES_BY_GROUP.ring,
      ...ACTIVITY_STYLES_BY_GROUP.helix,
    ]);
  });

  test("pick stays inside the requested groups", () => {
    const pool = new Set(
      stylesForGroups([
        ActivityIndicatorGroup.Lattice,
        ActivityIndicatorGroup.Ring,
        ActivityIndicatorGroup.Helix,
      ]),
    );
    for (let i = 0; i < 40; i++) {
      const picked = pickActivityIndicatorStyle([
        ActivityIndicatorGroup.Lattice,
        ActivityIndicatorGroup.Ring,
        ActivityIndicatorGroup.Helix,
      ]);
      expect(pool.has(picked)).toBe(true);
    }
  });

  test("type guards", () => {
    expect(isActivityIndicatorGroup("lattice")).toBe(true);
    expect(isActivityIndicatorGroup("S1")).toBe(false);
    expect(isActivityIndicatorStyle("stars")).toBe(true);
    expect(isActivityIndicatorStyle("random")).toBe(false);
    expect(isUnicodeSpinnerId("braille")).toBe(true);
    expect(isUnicodeSpinnerId("helix")).toBe(true);
    expect(isUnicodeSpinnerId("S1")).toBe(false);
    expect(isOrbIndicatorId("G1")).toBe(true);
    expect(isOrbIndicatorId("braille")).toBe(false);
  });
});
