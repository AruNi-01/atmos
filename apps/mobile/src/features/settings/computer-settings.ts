import type { ComputerRow } from "@/api/types";

export function activeSettingsComputers(computers: ComputerRow[]): ComputerRow[] {
  return computers.filter((computer) => !computer.revoked);
}

export type ComputerOnlineCountSummary =
  | { accessibilityLabel: "No computers"; kind: "empty"; label: "None" }
  | { accessibilityLabel: string; kind: "ratio"; online: number; total: number };

export function formatComputerOnlineCount(
  online: number,
  total: number,
): ComputerOnlineCountSummary {
  if (total <= 0) {
    return { accessibilityLabel: "No computers", kind: "empty", label: "None" };
  }
  const safeOnline = Math.max(0, Math.min(online, total));
  return {
    accessibilityLabel: `${safeOnline} of ${total} online`,
    kind: "ratio",
    online: safeOnline,
    total,
  };
}

/**
 * Offline selection is local, so the sheet can close immediately.
 * An online switch closes only after `createClientSession` succeeds.
 */
export function runComputerSelection(input: {
  dismissSheet: () => void;
  online: boolean;
  selectOffline: () => void;
  switchOnline: (onSuccess: () => void) => void;
}) {
  if (!input.online) {
    input.selectOffline();
    input.dismissSheet();
    return;
  }
  input.switchOnline(input.dismissSheet);
}
