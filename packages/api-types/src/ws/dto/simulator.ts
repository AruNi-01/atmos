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
  | "start_failed"
  | "android_sdk_missing"
  | "adb_missing"
  | "emulator_missing"
  | "no_avd"
  | "device_already_claimed";

export type SimulatorDevicePlatform = "ios" | "android";

export type SimulatorHelperKind = "serve_sim" | "serve_emu";

export type SimulatorDevice = {
  udid: string;
  name: string;
  runtime: string;
  state: string;
  available: boolean;
  platform: SimulatorDevicePlatform;
  claimed_by_workspace?: string | null;
  serial?: string | null;
};

export type SimulatorPlatformProbe = {
  ready: boolean;
  reason: SimulatorReason;
  helper_installed: boolean;
  helper_version: string;
  devices: SimulatorDevice[];
};

export type SimulatorProbe = {
  ready: boolean;
  reason: SimulatorReason;
  platform: string;
  arch: string;
  macos_version: string | null;
  ios: SimulatorPlatformProbe;
  android: SimulatorPlatformProbe;
};

export type SimulatorClaim = {
  workspace_id: string;
  pid: number;
  port: number;
  udid: string;
  argv_id?: string;
  url: string;
  version: string;
  platform: SimulatorDevicePlatform;
  helper: SimulatorHelperKind;
};

export type SimulatorDownloadProgress = {
  workspace_id?: string;
  helper?: SimulatorHelperKind;
  downloaded: number;
  total: number | null;
};

export type SimulatorStartRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
};

export type SimulatorWorkspaceRequest = {
  workspace_id: string;
};

export type SimulatorStartResult = {
  ready: boolean;
  reason?: SimulatorReason;
  url?: string | null;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
  probe: SimulatorProbe;
};

export type SimulatorStopResponse = {
  stopped: boolean;
};
