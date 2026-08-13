import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  initialDegradeState,
  isCaptureMismatchStderr,
  liveSessionShouldRestart,
  reduceDegrade,
} from "./degrade.ts";

const mismatch = readFileSync(
  join(import.meta.dir, "__fixtures__", "mismatch-stderr.txt"),
  "utf8",
);

describe("degrade reducer", () => {
  it("falls webrtc → http h264 → mjpeg without leaving a rendering state", () => {
    let state = reduceDegrade(initialDegradeState(), {
      type: "start",
      webrtcOptIn: true,
    });
    expect(state.transport).toBe("webrtc");
    expect(state.phase).toBe("starting");

    state = reduceDegrade(state, { type: "first_frame" });
    expect(state.keepFrame).toBe(true);
    expect(state.phase).toBe("streaming");

    state = reduceDegrade(state, { type: "webrtc_unusable" });
    expect(state.transport).toBe("http");
    expect(state.codec).toBe("h264");
    expect(state.phase).toBe("streaming");
    expect(state.keepFrame).toBe(true);

    state = reduceDegrade(state, { type: "h264_unusable" });
    expect(state.codec).toBe("mjpeg");
    expect(state.phase).toBe("streaming");
    expect(state.keepFrame).toBe(true);
  });

  it("retries mismatch once as mjpeg then stops", () => {
    expect(isCaptureMismatchStderr(mismatch)).toBe(true);
    let state = reduceDegrade(initialDegradeState(), {
      type: "start",
      webrtcOptIn: false,
    });
    state = reduceDegrade(state, { type: "mismatch_stderr", stderr: mismatch });
    expect(state.codec).toBe("mjpeg");
    expect(state.mismatchRetryDone).toBe(true);
    expect(state.phase).not.toBe("failed");

    state = reduceDegrade(state, { type: "mismatch_stderr", stderr: mismatch });
    expect(state.phase).toBe("failed");
    expect(state.lastError?.code).toBe("capture_xcode_mismatch");
  });

  it("contains no screenshot-poll branch", () => {
    const src = readFileSync(join(import.meta.dir, "degrade.ts"), "utf8");
    expect(src).not.toContain("simctl io screenshot");
    expect(src).not.toContain("screenshot");
  });

  it("restarts the helper three times then fails", () => {
    let state = reduceDegrade(initialDegradeState(), {
      type: "start",
      webrtcOptIn: false,
    });
    state = reduceDegrade(state, { type: "first_frame" });
    state = reduceDegrade(state, { type: "helper_died" });
    expect(state.phase).toBe("reconnecting");
    state = reduceDegrade(state, { type: "reconnect_ok" });
    state = reduceDegrade(state, { type: "helper_died" });
    state = reduceDegrade(state, { type: "helper_died" });
    expect(state.phase).toBe("reconnecting");
    state = reduceDegrade(state, { type: "helper_died" });
    expect(state.phase).toBe("failed");
    expect(state.reconnectAttempts).toBe(4);
  });

  it("treats failed and dead sessions as restartable", () => {
    expect(liveSessionShouldRestart({ phase: "failed" })).toBe(true);
    expect(liveSessionShouldRestart({ phase: "streaming", health: "dead" })).toBe(true);
    expect(liveSessionShouldRestart({ phase: "streaming", health: "ok" })).toBe(false);
  });
});
