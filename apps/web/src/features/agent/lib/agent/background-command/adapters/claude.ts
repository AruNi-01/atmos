import type { BackgroundCommandAdapter } from "../types";
import {
  commandFromProbe,
  envelopeType,
  flagTrue,
  isActiveStatus,
  nestedRecords,
  normalizeName,
} from "../utils";

export const claudeBackgroundAdapter: BackgroundCommandAdapter = {
  detect(probe) {
    const flagged = nestedRecords(probe.input).some((record) => flagTrue(record, ["run_in_background"]));
    if (!flagged) return null;
    return {
      command: commandFromProbe(probe),
      running: isActiveStatus(probe.status),
    };
  },

  isPoll(probe) {
    const name = normalizeName(probe.name);
    return name === "bashoutput" || name === "bash_output" || envelopeType(probe.input) === "bashoutput";
  },
};
