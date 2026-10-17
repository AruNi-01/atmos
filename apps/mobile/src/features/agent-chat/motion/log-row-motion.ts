/**
 * Live web tool groups use boardui `LogRow` / `RowConnector`, not
 * `AgentTreeBranch`. Elbow 140ms linear, non-first delay 120ms, trunk
 * 120ms linear. Row reveal is UNIT_TRANSITION (380–440ms, ease 0.22/1/0.36/1).
 */
export const LOG_ROW_ELBOW_MS = 140;
export const LOG_ROW_ELBOW_DELAY_MS = 120;
export const LOG_ROW_TRUNK_MS = 120;
export const LOG_ROW_REVEAL_HEIGHT_MS = 380;
export const LOG_ROW_REVEAL_MS = 420;
export const LOG_ROW_EASE = [0.22, 1, 0.36, 1] as const;

export function logRowElbowDelayMs(first: boolean): number {
  return first ? 0 : LOG_ROW_ELBOW_DELAY_MS;
}
