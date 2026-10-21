import {
  ALL_COMPUTERS_VALUE,
  currentUniqueComputer,
  type UniqueComputer,
} from "@/features/token-usage/lib/unique-computers";

export function resolveUsageScope(input: {
  devices: UniqueComputer[];
  selection: string | null;
  showSelect: boolean;
}) {
  const current = currentUniqueComputer(input.devices);
  const selectionValid =
    input.selection === ALL_COMPUTERS_VALUE ||
    (input.selection != null && input.devices.some((device) => device.key === input.selection));
  const selectedKey = selectionValid ? input.selection! : (current?.key ?? ALL_COMPUTERS_VALUE);
  const isAll = input.showSelect && selectedKey === ALL_COMPUTERS_VALUE;
  const selectedDevice = input.devices.find((device) => device.key === selectedKey) ?? null;
  const isCurrentScope = !input.showSelect || selectedDevice?.isCurrent === true;
  const scopedUsageKey = isAll
    ? `${ALL_COMPUTERS_VALUE}:${[...input.devices.map((device) => device.key)].sort().join(",")}`
    : selectedKey;
  return {
    isAll,
    isCurrentScope,
    scopedUsageKey,
    selectedDevice,
    selectedKey,
    showSelect: input.showSelect,
  };
}

export function tokenUsageScopeErrorMessage(
  error: unknown,
  scope: { isAll: boolean; isCurrentScope: boolean },
): string | null {
  if (!(error instanceof Error) || error.message.trim().length === 0) return null;
  if (scope.isCurrentScope) return error.message;
  if (scope.isAll || error.message === "none-reached") return "Could not reach any Computer.";
  return "Could not load that Computer.";
}

export function missedComputerWarning(name: string) {
  return `Could not reach ${name}`;
}
