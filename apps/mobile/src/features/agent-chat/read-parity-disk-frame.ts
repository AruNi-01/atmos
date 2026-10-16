import { File, Paths } from "expo-file-system";
import { PARITY_FRAME_FILE, parseParityDiskFrame, type ParityFrame } from "./parity-cycle";

/**
 * The iOS capture script writes `parity-frame.json` and relaunches.
 * A missing file, or this module on web, means there is no pin.
 */
export function readParityDiskFrame(): ParityFrame | null {
  try {
    const file = new File(Paths.document, PARITY_FRAME_FILE);
    if (!file.exists) {
      console.error(`[parity] disk missing ${file.uri}`);
      return null;
    }
    const frame = parseParityDiskFrame(file.textSync());
    if (!frame) console.error("[parity] disk unreadable");
    return frame;
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    console.error(`[parity] disk error ${message}`);
    return null;
  }
}
