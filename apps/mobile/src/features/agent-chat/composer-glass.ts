import { radii } from "@/theme/radii";

/** Same well size as `AgentChatComposer` plus / send / context glass controls. */
export const COMPOSER_GLASS_CONTROL_SIZE = 36;
export const COMPOSER_GLASS_CONTROL_RADIUS = 18;
/** Composer dock radius kept from the 23964b7 layout (`radii.control`). */
export const COMPOSER_GLASS_DOCK_RADIUS = radii.control;

/**
 * Native Liquid Glass args shared by composer wells, the dock, and card-lane
 * GlassPanel chrome. No tint, no extra fill, no extra border — GlassView owns
 * the material.
 *
 * Containers (dock, title pills, N-below, expanded card) use GlassPanel because
 * they wrap RN `TextInput` / NumberFlow / Lucide / ScrollView. Labeled in-card
 * actions use Expo UI `buttonStyle("glass")` via `GlassTextButton`.
 */
export const COMPOSER_GLASS_WELL = {
  interactive: true,
  shadow: false,
} as const;
