export type SimulatorReason =
  | "ok"
  | "not_desktop"
  | "unsupported_platform"
  | "unsupported_arch"
  | "macos_too_old"
  | "xcode_missing"
  | "simctl_missing"
  | "no_runtime"
  | "no_device"
  | "helper_missing"
  | "download_failed"
  | "checksum_mismatch"
  | "start_failed";

export type SimulatorDevice = {
  udid: string;
  name: string;
  runtime: string;
  state: string;
  available: boolean;
};

export type SimulatorProbe = {
  ready: boolean;
  reason: SimulatorReason;
  platform: string;
  arch: string;
  macosVersion: string | null;
  xcode: boolean;
  simctl: boolean;
  devices: SimulatorDevice[];
  helperInstalled: boolean;
  helperVersion: string;
};

export type SimulatorClaim = {
  workspaceId: string;
  pid: number;
  port: number;
  udid: string;
  url: string;
  version: string;
  startedAt: number;
};

export type SimulatorDownloadProgress = {
  workspace_id?: string;
  downloaded: number;
  total: number | null;
};

export type SimulatorStartRequest = {
  workspace_id: string;
  udid?: string | null;
};

export type SimulatorWorkspaceRequest = {
  workspace_id: string;
};

export type SimulatorStartResult = {
  ready: boolean;
  reason?: SimulatorReason;
  url?: string | null;
  udid?: string | null;
} & Partial<SimulatorProbe>;

export type SimulatorStopResponse = {
  stopped: boolean;
};
