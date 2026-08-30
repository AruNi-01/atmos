/**
 * Catalog for ActivityIndicator — unicode spinners, AIcss Orbs, BoardUI Stars.
 *
 * Groups are the unit for random pools. Concrete styles are what we pin or pick.
 */

import {
  HELIX_VARIANTS,
  LATTICE_VARIANTS,
  LENS_VARIANTS,
  MORPH_VARIANTS,
  RING_VARIANTS,
  type OrbVariant,
} from "./orb";

export const ActivityIndicatorGroup = {
  Unicode: "unicode",
  Lattice: "lattice",
  Lens: "lens",
  Ring: "ring",
  Helix: "helix",
  Morph: "morph",
  Stars: "stars",
} as const;

export type ActivityIndicatorGroup =
  (typeof ActivityIndicatorGroup)[keyof typeof ActivityIndicatorGroup];

export const ACTIVITY_INDICATOR_GROUPS: readonly ActivityIndicatorGroup[] = [
  ActivityIndicatorGroup.Unicode,
  ActivityIndicatorGroup.Lattice,
  ActivityIndicatorGroup.Lens,
  ActivityIndicatorGroup.Ring,
  ActivityIndicatorGroup.Helix,
  ActivityIndicatorGroup.Morph,
  ActivityIndicatorGroup.Stars,
];

export const UNICODE_SPINNER_IDS = [
  "braille",
  "helix",
  "scan",
  "cascade",
  "orbit",
  "snake",
  "breathe",
  "pulse",
  "dna",
  "rain",
] as const;

export type UnicodeSpinnerId = (typeof UNICODE_SPINNER_IDS)[number];

export const ORB_VARIANT_IDS: readonly OrbVariant[] = [
  ...LATTICE_VARIANTS,
  ...LENS_VARIANTS,
  ...RING_VARIANTS,
  ...HELIX_VARIANTS,
  ...MORPH_VARIANTS,
];

export type ActivityIndicatorStyle = UnicodeSpinnerId | OrbVariant | "stars";

export const ACTIVITY_STYLES_BY_GROUP: Record<
  ActivityIndicatorGroup,
  readonly ActivityIndicatorStyle[]
> = {
  unicode: UNICODE_SPINNER_IDS,
  lattice: LATTICE_VARIANTS,
  lens: LENS_VARIANTS,
  ring: RING_VARIANTS,
  helix: HELIX_VARIANTS,
  morph: MORPH_VARIANTS,
  stars: ["stars"],
};

export const ACTIVITY_INDICATOR_STYLES: readonly ActivityIndicatorStyle[] =
  ACTIVITY_INDICATOR_GROUPS.flatMap((group) => ACTIVITY_STYLES_BY_GROUP[group]);

const STYLE_SET = new Set<string>(ACTIVITY_INDICATOR_STYLES);
const GROUP_SET = new Set<string>(ACTIVITY_INDICATOR_GROUPS);
const UNICODE_SET = new Set<string>(UNICODE_SPINNER_IDS);
const ORB_SET = new Set<string>(ORB_VARIANT_IDS);

export function isActivityIndicatorGroup(
  value: unknown,
): value is ActivityIndicatorGroup {
  return typeof value === "string" && GROUP_SET.has(value);
}

export function isActivityIndicatorStyle(
  value: unknown,
): value is ActivityIndicatorStyle {
  return typeof value === "string" && STYLE_SET.has(value);
}

export function isUnicodeSpinnerId(value: unknown): value is UnicodeSpinnerId {
  return typeof value === "string" && UNICODE_SET.has(value);
}

export function isOrbIndicatorId(value: unknown): value is OrbVariant {
  return typeof value === "string" && ORB_SET.has(value);
}

/** Expand groups into concrete styles. Empty / omitted → every group. */
export function stylesForGroups(
  groups?: readonly ActivityIndicatorGroup[] | null,
): ActivityIndicatorStyle[] {
  const resolved =
    groups && groups.length > 0 ? groups : ACTIVITY_INDICATOR_GROUPS;
  const styles: ActivityIndicatorStyle[] = [];
  for (const group of resolved) {
    if (!isActivityIndicatorGroup(group)) continue;
    styles.push(...ACTIVITY_STYLES_BY_GROUP[group]);
  }
  return styles.length > 0 ? styles : [...ACTIVITY_INDICATOR_STYLES];
}

export function pickActivityIndicatorStyle(
  groups?: readonly ActivityIndicatorGroup[] | null,
): ActivityIndicatorStyle {
  const pool = stylesForGroups(groups);
  return pool[Math.floor(Math.random() * pool.length)] ?? "braille";
}
