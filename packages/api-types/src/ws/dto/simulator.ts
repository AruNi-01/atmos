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
  | "device_already_claimed"
  | "device_not_booted"
  | "runtime_missing"
  | "system_image_missing"
  | "device_type_unknown"
  | "create_failed"
  | "boot_failed"
  | "shutdown_failed"
  | "delete_failed"
  | "camera_unavailable"
  | "appearance_unavailable"
  | "unsupported_on_platform";

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

export type SimulatorAppearance = "light" | "dark";

export type SimulatorCameraLens = "front" | "back";

export type SimulatorDeviceType = {
  id: string;
  name: string;
  platform: SimulatorDevicePlatform;
};

export type SimulatorDeviceRuntime = {
  id: string;
  name: string;
  platform: SimulatorDevicePlatform;
  supported_device_types: SimulatorDeviceType[];
};

export type SimulatorInventoryPlatform = {
  devices: SimulatorDevice[];
  device_types: SimulatorDeviceType[];
  runtimes: SimulatorDeviceRuntime[];
};

export type SimulatorInventory = {
  ios: SimulatorInventoryPlatform;
  android: SimulatorInventoryPlatform;
};

export type SimulatorInventoryRequest = {
  workspace_id?: string | null;
};

export type SimulatorCreateRequest = {
  platform: SimulatorDevicePlatform;
  device_type: string;
  runtime: string;
  name?: string | null;
};

export type SimulatorDeviceResult = {
  device: SimulatorDevice;
};

export type SimulatorDeviceOpRequest = {
  workspace_id: string;
  udid: string;
  platform: SimulatorDevicePlatform;
};

export type SimulatorDeleteResponse = {
  deleted: true;
  udid: string;
};

export type SimulatorAppearanceGetRequest = {
  workspace_id: string;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
};

export type SimulatorAppearanceSetRequest = {
  workspace_id: string;
  appearance: SimulatorAppearance;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
};

export type SimulatorAppearanceResult = {
  appearance: SimulatorAppearance;
  udid: string;
  platform: SimulatorDevicePlatform;
};

export type SimulatorCameraInjectRequest = {
  workspace_id: string;
  lens: SimulatorCameraLens;
  path?: string | null;
  png_base64?: string | null;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
};

export type SimulatorCameraClearRequest = {
  workspace_id: string;
  lens: SimulatorCameraLens;
  udid?: string | null;
  platform?: SimulatorDevicePlatform | null;
};

export type SimulatorCameraAck = {
  ok: boolean;
  lens: SimulatorCameraLens;
  udid: string;
};

export type SimulatorDevicesChanged = {
  platform?: SimulatorDevicePlatform | null;
};
