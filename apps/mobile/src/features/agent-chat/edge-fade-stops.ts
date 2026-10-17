/** Web `.agent-chat-edge-fade` is 3.5rem with these stops from the solid edge. */
export const AGENT_CHAT_EDGE_FADE_PX = 56;

export const agentChatEdgeFadeStops = [
  { at: 0, opacity: 1 },
  { at: 0.24, opacity: 0.88 },
  { at: 0.58, opacity: 0.46 },
  { at: 1, opacity: 0 },
] as const;

function fadeColor(background: string, opacity: number): string {
  if (background.startsWith("#") && background.length === 7) {
    const red = Number.parseInt(background.slice(1, 3), 16);
    const green = Number.parseInt(background.slice(3, 5), 16);
    const blue = Number.parseInt(background.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
  return background;
}

/** Same-hue stops. `transparent` is rgba(0,0,0,0) and turns a light fade gray. */
export function agentChatEdgeFadeGradient(
  background: string,
  edge: "top" | "bottom",
): { colors: [string, string, ...string[]]; locations: [number, number, ...number[]] } {
  const stops = agentChatEdgeFadeStops
    .map((stop) => ({
      at: edge === "top" ? stop.at : Math.round((1 - stop.at) * 100) / 100,
      opacity: stop.opacity,
    }))
    .sort((left, right) => left.at - right.at);
  const colors = stops.map((stop) => fadeColor(background, stop.opacity));
  const locations = stops.map((stop) => stop.at);
  return {
    colors: colors as [string, string, ...string[]],
    locations: locations as [number, number, ...number[]],
  };
}
