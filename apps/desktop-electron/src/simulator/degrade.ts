import type { Phase, StreamCodec, StreamTransport } from "./types.ts";

export type DegradeState = {
  phase: Phase;
  transport: StreamTransport;
  codec: StreamCodec;
  webrtcOptIn: boolean;
  reconnectAttempts: number;
  mismatchRetryDone: boolean;
  /** Once true, UI must keep last frame or skeleton — never a blank canvas. */
  keepFrame: boolean;
  lastError: { code: string; message: string } | null;
};

export type DegradeEvent =
  | { type: "start"; webrtcOptIn: boolean }
  | { type: "first_frame" }
  | { type: "webrtc_unusable" }
  | { type: "h264_unusable" }
  | { type: "mismatch_stderr"; stderr: string }
  | { type: "helper_died" }
  | { type: "reconnect_ok" };

const MAX_RECONNECTS = 3;

/** Attach must replace these instead of returning the dead session. */
export function liveSessionShouldRestart(session: {
  phase: Phase;
  health?: string;
}): boolean {
  return session.phase === "failed" || session.health === "dead";
}

export function isCaptureMismatchStderr(stderr: string): boolean {
  return /SimulatorKit|IOSurface|dlopen/i.test(stderr);
}

export function initialDegradeState(): DegradeState {
  return {
    phase: "idle",
    transport: "http",
    codec: "h264",
    webrtcOptIn: false,
    reconnectAttempts: 0,
    mismatchRetryDone: false,
    keepFrame: false,
    lastError: null,
  };
}

export function reduceDegrade(
  state: DegradeState,
  event: DegradeEvent,
): DegradeState {
  switch (event.type) {
    case "start":
      return {
        ...state,
        phase: "starting",
        webrtcOptIn: event.webrtcOptIn,
        transport: event.webrtcOptIn ? "webrtc" : "http",
        codec: "h264",
        reconnectAttempts: 0,
        mismatchRetryDone: false,
        lastError: null,
      };
    case "first_frame":
      return {
        ...state,
        phase: "streaming",
        keepFrame: true,
        lastError: null,
      };
    case "webrtc_unusable":
      if (state.transport !== "webrtc") return state;
      return {
        ...state,
        phase: state.keepFrame ? "streaming" : "starting",
        transport: "http",
        codec: "h264",
      };
    case "h264_unusable":
      return {
        ...state,
        phase: state.keepFrame ? "streaming" : "starting",
        transport: "http",
        codec: "mjpeg",
      };
    case "mismatch_stderr": {
      if (!isCaptureMismatchStderr(event.stderr)) {
        return {
          ...state,
          phase: "failed",
          lastError: { code: "capture_failed", message: event.stderr },
        };
      }
      if (!state.mismatchRetryDone) {
        return {
          ...state,
          mismatchRetryDone: true,
          phase: state.keepFrame ? "streaming" : "starting",
          transport: "http",
          codec: "mjpeg",
        };
      }
      return {
        ...state,
        phase: "failed",
        lastError: {
          code: "capture_xcode_mismatch",
          message: event.stderr,
        },
      };
    }
    case "helper_died": {
      const nextAttempts = state.reconnectAttempts + 1;
      if (nextAttempts > MAX_RECONNECTS) {
        return {
          ...state,
          reconnectAttempts: nextAttempts,
          phase: "failed",
          lastError: {
            code: "helper_dead",
            message: "Capture helper stopped after 3 reconnects",
          },
        };
      }
      return {
        ...state,
        reconnectAttempts: nextAttempts,
        phase: "reconnecting",
      };
    }
    case "reconnect_ok":
      return {
        ...state,
        phase: "streaming",
        keepFrame: true,
        lastError: null,
      };
    default: {
      const _never: never = event;
      return _never;
    }
  }
}
