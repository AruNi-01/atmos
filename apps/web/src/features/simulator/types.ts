export type {
  SimulatorClaim,
  SimulatorDevice,
  SimulatorDevicePlatform,
  SimulatorDownloadProgress,
  SimulatorHelperKind,
  SimulatorPlatformProbe,
  SimulatorProbe,
  SimulatorReason,
  SimulatorStartRequest,
  SimulatorStartResult,
} from "@atmos/api-types/ws/dto/simulator";
import type {
  SimulatorPlatformProbe,
  SimulatorProbe,
  SimulatorReason,
} from "@atmos/api-types/ws/dto/simulator";

export const SIMULATOR_TAB_VALUE = "simulator";

export const SIMULATOR_STOP_MESSAGE = "atmos:simulator-stop";
export const SIMULATOR_DEVICE_MESSAGE = "atmos:simulator-device";

export type SimulatorSetupAction = {
  id: string;
  href?: string;
  kind: "external" | "retry" | "desktop";
};

export function simulatorHelperReachable(
  connectionMode: "local" | "relay" | null | undefined,
): boolean {
  return connectionMode !== "relay";
}

export function parseSimulatorDeviceMessage(data: unknown): {
  udid: string;
  platform?: "ios" | "android";
} | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (rec.type !== SIMULATOR_DEVICE_MESSAGE) return null;
  if (typeof rec.udid !== "string") return null;
  const udid = rec.udid.trim();
  if (!udid) return null;
  const platform =
    rec.platform === "ios" || rec.platform === "android" ? rec.platform : undefined;
  return { udid, platform };
}

const HOST_REASONS: SimulatorReason[] = [
  "unsupported_platform",
  "unsupported_arch",
  "macos_too_old",
];

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

export function platformCanStart(probe: SimulatorPlatformProbe): boolean {
  return probe.ready || probe.reason === "helper_missing";
}

export function isHostBlockedReason(reason: SimulatorReason): boolean {
  return HOST_REASONS.includes(reason);
}

export function probeCanStart(probe: SimulatorProbe): boolean {
  if (isHostBlockedReason(probe.reason)) return false;
  return platformCanStart(probe.ios) || platformCanStart(probe.android);
}

export function displayReasonFromProbe(probe: SimulatorProbe): SimulatorReason {
  if (isHostBlockedReason(probe.reason)) return probe.reason;
  if (probeCanStart(probe)) return probe.ready ? "ok" : "helper_missing";
  if (!platformCanStart(probe.ios) && probe.ios.reason !== "ok") {
    return probe.ios.reason;
  }
  return probe.android.reason;
}

export function displayReasonFromStart(
  reason: SimulatorReason,
  probe?: SimulatorProbe | null,
): SimulatorReason {
  if (reason === "no_device" && probeHasDevices(probe)) {
    return "device_already_claimed";
  }
  return reason;
}

function probeHasDevices(probe?: SimulatorProbe | null): boolean {
  return Boolean(probe && (probe.ios.devices.length > 0 || probe.android.devices.length > 0));
}

export function setupActionForReason(reason: SimulatorReason): SimulatorSetupAction | null {
  switch (reason) {
    case "not_desktop":
      return { id: "retry", kind: "retry" };
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
    case "android_sdk_missing":
    case "adb_missing":
    case "emulator_missing":
      return {
        id: "installAndroidSdk",
        kind: "external",
        href: "https://developer.android.com/studio",
      };
    case "no_avd":
      return {
        id: "createAvd",
        kind: "external",
        href: "https://developer.android.com/studio/run/managing-avds",
      };
    case "device_already_claimed":
      return { id: "retry", kind: "retry" };
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
