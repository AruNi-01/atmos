import { describe, expect, test } from "bun:test";
import {
  getMdLiveStreamSnapshot,
  isMdLiveStreamLocked,
  lockMdLiveStream,
  restoreAndUnlockMdLiveStream,
  unlockMdLiveStream,
} from "./md-live-stream-lock";

describe("md-live stream lock", () => {
  test("locks and unlocks a path", () => {
    const path = "/repo/note.md";
    expect(isMdLiveStreamLocked(path)).toBe(false);
    lockMdLiveStream(path);
    expect(isMdLiveStreamLocked(path)).toBe(true);
    unlockMdLiveStream(path);
    expect(isMdLiveStreamLocked(path)).toBe(false);
  });

  test("keeps the pre-stream snapshot outside React so unmount can restore it", () => {
    const path = `/repo/restore-${Date.now()}.md`;
    lockMdLiveStream(path, "# before\n");
    expect(getMdLiveStreamSnapshot(path)).toBe("# before\n");
    let written: string | null = null;
    expect(
      restoreAndUnlockMdLiveStream(path, (content) => {
        written = content;
      }),
    ).toBe(true);
    expect(written).toBe("# before\n");
    expect(isMdLiveStreamLocked(path)).toBe(false);
    expect(getMdLiveStreamSnapshot(path)).toBeNull();
  });

  test("restoreAndUnlock is a no-op when the path is not locked", () => {
    const path = `/repo/idle-${Date.now()}.md`;
    let writes = 0;
    expect(restoreAndUnlockMdLiveStream(path, () => {
      writes += 1;
    })).toBe(false);
    expect(writes).toBe(0);
  });
});
