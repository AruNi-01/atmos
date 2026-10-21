import {
  ALL_COMPUTERS_VALUE,
  type UniqueComputer,
} from "@/features/token-usage/lib/unique-computers";

export function resolveUsageScope(input: {
  devices: UniqueComputer[];
  selection: string | null;
  showSelect: boolean;
}) {
  const current = input.devices.find((device) => device.isCurrent) ?? null;
  const selectionValid =
    input.selection === ALL_COMPUTERS_VALUE ||
    (input.selection != null && input.devices.some((device) => device.key === input.selection));
  // The connected computer stays selected when it is missing from the list.
  // Do not substitute All, and do not substitute whichever row is first.
  const selectedKey = selectionValid ? input.selection! : (current?.key ?? null);
  const isAll = input.showSelect && selectedKey === ALL_COMPUTERS_VALUE;
  const selectedDevice =
    selectedKey == null
      ? null
      : (input.devices.find((device) => device.key === selectedKey) ?? null);
  const isCurrentScope =
    !input.showSelect || selectedDevice?.isCurrent === true || selectedKey === null;
  const scopedUsageKey = isAll
    ? `${ALL_COMPUTERS_VALUE}:${[...input.devices.map((device) => device.key)].sort().join(",")}`
    : (selectedKey ?? "current");
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
