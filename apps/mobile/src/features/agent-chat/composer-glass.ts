/** Same well size as `AgentChatComposer` plus / send / context glass controls. */
export const COMPOSER_GLASS_CONTROL_SIZE = 36;
export const COMPOSER_GLASS_CONTROL_RADIUS = 18;

/**
 * Native Liquid Glass args shared by composer wells and the card-lane pills.
 * No tint, no extra fill, no extra border — GlassView owns the material.
 */
export const COMPOSER_GLASS_WELL = {
  interactive: true,
  shadow: false,
} as const;
