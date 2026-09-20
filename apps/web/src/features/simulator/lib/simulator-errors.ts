import type { SimulatorReason } from "../types";

export type SimulatorChromeReason = SimulatorReason | "no_claim";

const SNAKE_REASONS: SimulatorChromeReason[] = [
  "device_already_claimed",
  "device_not_booted",
  "runtime_missing",
  "system_image_missing",
  "device_type_unknown",
  "create_failed",
  "boot_failed",
  "shutdown_failed",
  "delete_failed",
  "camera_unavailable",
  "appearance_unavailable",
  "unsupported_on_platform",
  "no_claim",
];

const CODE_TO_REASON: Record<string, SimulatorChromeReason> = {
  NO_CLAIM: "no_claim",
  DEVICE_NOT_BOOTED: "device_not_booted",
  CAMERA_UNAVAILABLE: "camera_unavailable",
  APPEARANCE_UNAVAILABLE: "appearance_unavailable",
  UNSUPPORTED_ON_PLATFORM: "unsupported_on_platform",
  CLAIMED_BY_OTHER_WORKSPACE: "device_already_claimed",
};

export function parseSimulatorError(error: unknown): SimulatorChromeReason | null {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const code = text.match(/^\[([A-Z0-9_]+)\]/)?.[1];
  if (code && CODE_TO_REASON[code]) return CODE_TO_REASON[code];
  const lower = text.toLowerCase();
  for (const reason of SNAKE_REASONS) {
    if (lower.includes(reason)) return reason;
  }
  return null;
}

export function simulatorErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}
