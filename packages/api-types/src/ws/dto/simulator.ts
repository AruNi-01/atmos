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

export type SimulatorListRequest = {
  workspace_id?: string | null;
};

export type SimulatorClaimListItem = {
  udid: string;
  name: string;
  platform: SimulatorDevicePlatform;
  helper: SimulatorHelperKind;
  workspace_id: string;
  workspace_name: string;
  project_id: string;
  project_name: string;
  current: boolean;
};

export type SimulatorClaimList = {
  devices: SimulatorClaimListItem[];
};

export type SimulatorScreenshotRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
  out?: string | null;
};

export type SimulatorScreenshotResult = {
  path: string;
  width: number;
  height: number;
  udid: string;
  name: string;
  platform: SimulatorDevicePlatform;
  helper: SimulatorHelperKind;
};

export type SimulatorTapRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
  x: number;
  y: number;
};

export type SimulatorSwipeRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  duration_ms?: number | null;
};

export type SimulatorTypeRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
  text: string;
};

export type SimulatorPressKey = "home" | "back" | "recents";

export type SimulatorPressRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
  key: SimulatorPressKey;
};

export type SimulatorControlAck = {
  ok: boolean;
  udid: string;
  name: string;
  platform: SimulatorDevicePlatform;
};
