/**
 * Agent activity indicator style catalog.
 *
 * Combines:
 * - Unicode spinners already used in Atmos (unicode-animations)
 * - AIcss Orbs (https://www.aicss.dev/components/orbs)
 */

import {
  HELIX_VARIANTS,
  LATTICE_VARIANTS,
  LENS_VARIANTS,
  MORPH_VARIANTS,
  RING_VARIANTS,
  type OrbVariant,
} from "@/features/agent/components/orbs/Orb";

/** Placements that can pick their own running indicator. */
export type AgentIndicatorPlacement =
  | "left_sidebar"
  | "center_terminal"
  | "terminal_panel"
  | "footer";

/** Unicode spinner names historically used in Atmos agent status UI. */
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

/** Special id: pick a random unicode spinner per mount (legacy full-indicator behavior). */
export const RANDOM_UNICODE_ID = "random" as const;

export type AgentActivityIndicatorId =
  | UnicodeSpinnerId
  | typeof RANDOM_UNICODE_ID
  | OrbVariant;

export type IndicatorFamily =
  | "unicode"
  | "lattice"
  | "lens"
  | "ring"
  | "helix"
  | "morph";

export interface IndicatorStyleOption {
  id: AgentActivityIndicatorId;
  family: IndicatorFamily;
  /** Short label for picker cards (variant code or spinner name). */
  label: string;
}

export const ORB_VARIANT_IDS: readonly OrbVariant[] = [
  ...LATTICE_VARIANTS,
  ...LENS_VARIANTS,
  ...RING_VARIANTS,
  ...HELIX_VARIANTS,
  ...MORPH_VARIANTS,
];

export const UNICODE_STYLE_OPTIONS: readonly IndicatorStyleOption[] = [
  { id: RANDOM_UNICODE_ID, family: "unicode", label: "Random" },
  ...UNICODE_SPINNER_IDS.map(
    (id): IndicatorStyleOption => ({
      id,
      family: "unicode",
      label: id,
    }),
  ),
];

function orbFamily(id: OrbVariant): IndicatorFamily {
  if ((LATTICE_VARIANTS as readonly string[]).includes(id)) return "lattice";
  if ((LENS_VARIANTS as readonly string[]).includes(id)) return "lens";
  if ((RING_VARIANTS as readonly string[]).includes(id)) return "ring";
  if ((HELIX_VARIANTS as readonly string[]).includes(id)) return "helix";
  return "morph";
}

export const ORB_STYLE_OPTIONS: readonly IndicatorStyleOption[] = ORB_VARIANT_IDS.map(
  (id) => ({
    id,
    family: orbFamily(id),
    label: id,
  }),
);

/** All selectable styles, unicode first then orbs by family order. */
export const ALL_INDICATOR_STYLE_OPTIONS: readonly IndicatorStyleOption[] = [
  ...UNICODE_STYLE_OPTIONS,
  ...ORB_STYLE_OPTIONS,
];

export const INDICATOR_STYLE_GROUPS: ReadonlyArray<{
  family: IndicatorFamily;
  options: readonly IndicatorStyleOption[];
}> = [
  { family: "unicode", options: UNICODE_STYLE_OPTIONS },
  {
    family: "lattice",
    options: ORB_STYLE_OPTIONS.filter((o) => o.family === "lattice"),
  },
  {
    family: "lens",
    options: ORB_STYLE_OPTIONS.filter((o) => o.family === "lens"),
  },
  {
    family: "ring",
    options: ORB_STYLE_OPTIONS.filter((o) => o.family === "ring"),
  },
  {
    family: "helix",
    options: ORB_STYLE_OPTIONS.filter((o) => o.family === "helix"),
  },
  {
    family: "morph",
    options: ORB_STYLE_OPTIONS.filter((o) => o.family === "morph"),
  },
];

const VALID_IDS = new Set<string>(
  ALL_INDICATOR_STYLE_OPTIONS.map((o) => o.id),
);

export function isAgentActivityIndicatorId(
  value: unknown,
): value is AgentActivityIndicatorId {
  return typeof value === "string" && VALID_IDS.has(value);
}

export function isOrbIndicatorId(id: AgentActivityIndicatorId): id is OrbVariant {
  return (ORB_VARIANT_IDS as readonly string[]).includes(id);
}

export function isUnicodeIndicatorId(
  id: AgentActivityIndicatorId,
): id is UnicodeSpinnerId | typeof RANDOM_UNICODE_ID {
  return id === RANDOM_UNICODE_ID || (UNICODE_SPINNER_IDS as readonly string[]).includes(id);
}

/** Defaults match the previous compact braille spinner everywhere. */
export const DEFAULT_INDICATOR_BY_PLACEMENT: Record<
  AgentIndicatorPlacement,
  AgentActivityIndicatorId
> = {
  left_sidebar: "braille",
  center_terminal: "braille",
  /** Full pane status previously used a random unicode spinner each mount. */
  terminal_panel: "random",
  footer: "braille",
};

export const INDICATOR_PLACEMENTS: readonly AgentIndicatorPlacement[] = [
  "left_sidebar",
  "center_terminal",
  "terminal_panel",
  "footer",
] as const;

/** function_settings.json keys under `agent_cli`. */
export const INDICATOR_SETTING_KEYS: Record<
  AgentIndicatorPlacement,
  `activity_indicator_${AgentIndicatorPlacement}`
> = {
  left_sidebar: "activity_indicator_left_sidebar",
  center_terminal: "activity_indicator_center_terminal",
  terminal_panel: "activity_indicator_terminal_panel",
  footer: "activity_indicator_footer",
};

export function resolveIndicatorId(
  value: unknown,
  placement: AgentIndicatorPlacement,
): AgentActivityIndicatorId {
  return isAgentActivityIndicatorId(value)
    ? value
    : DEFAULT_INDICATOR_BY_PLACEMENT[placement];
}
