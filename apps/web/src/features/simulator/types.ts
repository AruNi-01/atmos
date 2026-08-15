export const SIMULATOR_TAB_VALUE = "simulator";

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

export type SimulatorSetupAction = {
  id: string;
  href?: string;
  kind: "external" | "retry" | "desktop";
};

export function iframeSrc(url: string, udid?: string): string {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    parsed.hostname = "127.0.0.1";
  }
  if (udid && !parsed.searchParams.get("device")) {
    parsed.searchParams.set("device", udid);
  }
  return parsed.toString();
}

export function setupActionForReason(reason: SimulatorReason): SimulatorSetupAction | null {
  switch (reason) {
    case "not_desktop":
      return { id: "needDesktop", kind: "desktop", href: "https://atmos.land" };
    case "xcode_missing":
    case "simctl_missing":
    case "macos_too_old":
      return {
        id: "installXcode",
        kind: "external",
        href: "https://developer.apple.com/xcode/",
      };
    case "no_runtime":
    case "no_device":
      return {
        id: "openXcode",
        kind: "external",
        href: "https://developer.apple.com/documentation/xcode/installing-additional-simulator-runtimes",
      };
    case "ok":
    case "helper_missing":
      return { id: "start", kind: "retry" };
    case "download_failed":
    case "checksum_mismatch":
    case "start_failed":
      return { id: "retry", kind: "retry" };
    default:
      return null;
  }
}
