/**
 * Dynamic terminal title OSC codes (Atmos).
 *
 * - **9999** — real shell shim (preexec/precmd). May affect title *and* client
 *   side-effects (e.g. clear mouse when a foreground command truly ends).
 * - **9998** — synthetic reattach inject from the server only for an immediate
 *   title. Must never clear DEC mouse modes (APP-054): that raced with snapshot
 *   hydrate and forced local xterm scrollback after refresh.
 */

export const ATMOS_SHELL_TITLE_OSC = 9999;
export const ATMOS_REATTACH_TITLE_OSC = 9998;

/** Build OSC payload body `TYPE:payload` without ESC framing. */
export function formatAtmosTitleOscBody(
  kind: "CMD_START" | "CMD_END",
  payload: string,
): string {
  return `${kind}:${payload}`;
}

/** Full OSC string for reattach inject (title only on the client). */
export function formatReattachTitleOsc(
  kind: "CMD_START" | "CMD_END",
  payload: string,
): string {
  return `\x1b]${ATMOS_REATTACH_TITLE_OSC};${formatAtmosTitleOscBody(kind, payload)}\x07`;
}
