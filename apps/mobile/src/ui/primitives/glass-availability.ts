/** Liquid Glass only when the OS effect exists and transparency is allowed. */
export function shouldUseLiquidGlass(input: {
  apiAvailable: boolean;
  liquidGlassAvailable: boolean;
  reduceTransparency: boolean;
}): boolean {
  return input.liquidGlassAvailable && input.apiAvailable && !input.reduceTransparency;
}
