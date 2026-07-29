import { describe, expect, it, mock } from "bun:test";
import { setOverlayVisibleOnAllWorkspaces } from "./mac-dock.ts";

describe("setOverlayVisibleOnAllWorkspaces", () => {
  it("calls setVisibleOnAllWorkspaces with fullScreen option on darwin", async () => {
    if (process.platform !== "darwin") {
      // Helper is a no-op off macOS; still assert it does not throw.
      const win = {
        setVisibleOnAllWorkspaces: mock(() => {
          throw new Error("should not be called");
        }),
      };
      await setOverlayVisibleOnAllWorkspaces(win, true);
      expect(win.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
      return;
    }

    const calls: Array<{ v: boolean; opts?: { visibleOnFullScreen?: boolean } }> =
      [];
    const win = {
      setVisibleOnAllWorkspaces: (
        v: boolean,
        opts?: { visibleOnFullScreen?: boolean },
      ) => {
        calls.push({ v, opts });
      },
    };
    await setOverlayVisibleOnAllWorkspaces(win, true);
    expect(calls).toEqual([
      { v: true, opts: { visibleOnFullScreen: true } },
    ]);

    calls.length = 0;
    await setOverlayVisibleOnAllWorkspaces(win, false);
    expect(calls).toEqual([
      { v: false, opts: { visibleOnFullScreen: false } },
    ]);
  });
});
