import { PARITY_FIXTURE_IDS } from "@atmos/agent-transcript";

export const PARITY_THEMES = ["light", "dark"] as const;

/** Long enough for the capture script to screenshot after the ready line. */
export const PARITY_HOLD_MS = 15_000;

export type ParityTheme = (typeof PARITY_THEMES)[number];

export type ParityFrame = {
  id: string;
  theme: ParityTheme;
};

/** Light F1–F13, then dark F1–F13. One pass. */
export function parityCycleFrames(): ParityFrame[] {
  const frames: ParityFrame[] = [];
  for (const theme of PARITY_THEMES) {
    for (const id of PARITY_FIXTURE_IDS) {
      frames.push({ id, theme });
    }
  }
  return frames;
}

/**
 * Device-log evidence for one frame.
 * `seq` is the index in `parityCycleFrames()` (0 for a pinned query).
 */
export function parityReadyLine(frame: ParityFrame, seq: number): string {
  return `[parity] ready ${frame.id} ${frame.theme} #${seq}`;
}

/** A fixture query pins one frame and disables the carousel. */
export function parityPinnedFrame(fixture: string, theme: string): ParityFrame | null {
  const id = fixture.trim();
  if (!id) return null;
  return { id, theme: theme.trim() === "dark" ? "dark" : "light" };
}
