export type Phase =
  | "idle"
  | "probing"
  | "setup_required"
  | "starting"
  | "streaming"
  | "reconnecting"
  | "failed";

export type ProbeCode =
  | "platform_not_macos"
  | "helper_arch_unsupported"
  | "macos_too_old"
  | "missing_simctl"
  | "missing_ios_runtime"
  | "missing_iphone"
  | "helper_missing"
  | "capture_xcode_mismatch"
  | "capture_failed"
  | "helper_bind_not_loopback";

export type StreamTransport = "http" | "webrtc";
export type StreamCodec = "h264" | "mjpeg";

export type ProbeHost = {
  platform: string;
  arch: string;
  /** Product version from `sw_vers -productVersion`, e.g. "14.4.1". */
  macosVersion?: string;
};

export type ProbeRuntime = {
  identifier: string;
  name: string;
  version: string;
  isAvailable: boolean;
  platform: string;
};

export type ProbeSimulator = {
  id: string;
  name: string;
  runtimeId: string;
  runtimeName: string;
  state: string;
  isAvailable: boolean;
  typeId: string;
};

export type ProbeFacts = {
  macosVersion?: string;
  arch?: string;
  xcodePath?: string;
  xcodeVersion?: string;
  helperVersion?: string;
  runtimes: ProbeRuntime[];
  simulators: ProbeSimulator[];
};

export type ProbeResult = {
  ok: boolean;
  code: ProbeCode | null;
  facts: ProbeFacts;
};

export type SessionView = {
  phase: Phase;
  workspaceId: string;
  simulator: {
    id: string;
    name: string;
    runtime: string;
  } | null;
  streamBaseUrl: string | null;
  transport: StreamTransport | null;
  codec: StreamCodec | null;
  size: { width: number; height: number } | null;
  lastError: { code: string; message: string } | null;
};

export type HelperStateRecord = {
  pid: number;
  port: number;
  /** Upstream field `device` from the helper record — mapped to our simulator id. */
  simulatorId: string;
  url: string;
  streamUrl: string;
  wsUrl: string;
  streamSettingsUrl: string;
};

export type SimulatorClaim = {
  workspaceId: string;
  instanceId: string;
  since: string;
};

export type ClaimTable = Record<string, SimulatorClaim>;
