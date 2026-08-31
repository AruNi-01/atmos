import type { BackgroundCommandAdapter } from "../types";
import { commandFromProbe, flagTrue, isActiveStatus, nestedRecords } from "../utils";

const BG_TITLE_RE = /^\[bg\]/i;

export const fallbackBackgroundAdapter: BackgroundCommandAdapter = {
  detect(probe) {
    const flagged = nestedRecords(probe.input).some((record) => (
      flagTrue(record, ["is_background", "background", "run_in_background"])
    ));
    const titled = BG_TITLE_RE.test((probe.title ?? "").trim());
    if (!flagged && !titled) return null;
    return {
      command: commandFromProbe(probe),
      running: isActiveStatus(probe.status),
    };
  },

  isPoll() {
    return false;
  },
};
