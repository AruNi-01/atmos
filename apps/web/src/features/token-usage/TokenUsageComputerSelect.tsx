"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import {
  ALL_COMPUTERS_VALUE,
  type UniqueComputer,
} from "@/features/token-usage/lib/unique-computers";

export function TokenUsageComputerSelect({
  value,
  onValueChange,
  devices,
  allLabel,
  disabled,
  isDark,
}: {
  value: string;
  onValueChange: (next: string) => void;
  devices: UniqueComputer[];
  allLabel: string;
  disabled?: boolean;
  isDark: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={allLabel}
        className={cn(
          "h-8 w-auto max-w-[12.5rem] rounded-lg border text-xs font-medium",
          isDark
            ? "border-white/[0.07] bg-white/[0.04]"
            : "border-black/[0.08] bg-black/[0.04]",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL_COMPUTERS_VALUE}>{allLabel}</SelectItem>
        {devices.map((device) => (
          <SelectItem key={device.key} value={device.key}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
