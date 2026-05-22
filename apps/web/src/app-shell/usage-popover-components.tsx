"use client";

import { useState, type ReactNode } from "react";
import { Blocks, Coins, KeyRound, Plus, Trash2 } from "lucide-react";

import {
  Button,
  CSS,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TimerDisplay,
  TimerRoot,
  UiTimerIcon,
  cn,
  useSortable,
  useTimer,
} from "@workspace/ui";

import type { UsageManualSetupResponse } from "@/api/ws-api";

import { formatCountdownDisplay, usagePortalUrl, type ProviderRegion } from "./usage-popover-utils";

const ALL_PROVIDER_ID = "all";

export function UsageBar({ percent }: { percent?: number | null }) {
  const safePercent = Math.max(0, Math.min(percent ?? 0, 100));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted/80">
      <div
        className="h-full rounded-full bg-foreground transition-all duration-300"
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
}

export function AutoRefreshCountdownBadge({ targetTimeMs }: { targetTimeMs: number }) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  const { milliseconds } = useTimer({
    loading: true,
    format: "MM.SS.MS",
    onTick: () => {
      setCurrentTimeMs(Date.now());
    },
  });
  const time = formatCountdownDisplay(targetTimeMs - currentTimeMs);

  return (
    <TimerRoot
      variant="ghost"
      size="sm"
      loading
      data-tick={milliseconds}
      className="h-7 gap-1.5 rounded-sm px-1 text-[10px] font-medium text-foreground shadow-none"
    >
      <UiTimerIcon size="sm" loading className="text-foreground/90" />
      <TimerDisplay
        size="sm"
        time={time}
        label="Time until next auto refresh"
        className="text-[10px] text-foreground"
      />
    </TimerRoot>
  );
}

function regionOptionLabel(region: string | null, options: UsageManualSetupResponse["region_options"]): string {
  if (options.length === 0) return "";
  if (!region || region === "auto") return "Auto";
  return options.find((o) => o.value === region)?.label ?? region;
}

export function ProviderApiKeyManager({
  providerId,
  manualSetup,
  onAddKey,
  onDeleteKey,
  isSaving,
  deletingKeyId,
}: {
  providerId: string;
  manualSetup: UsageManualSetupResponse;
  onAddKey: (providerId: string, region: string, apiKey: string) => void;
  onDeleteKey: (providerId: string, keyId: string) => void;
  isSaving: boolean;
  deletingKeyId: string | null;
}) {
  const [region, setRegion] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [showAddForm, setShowAddForm] = useState(manualSetup.configured_keys.length === 0);
  const selectedRegion =
    region === "global" || region === "china" ? (region as ProviderRegion) : null;

  const handleAdd = () => {
    if (!apiKey.trim()) return;
    onAddKey(providerId, region, apiKey.trim());
    setApiKey("");
    setShowAddForm(false);
  };

  return (
    <div className="mt-3 space-y-2">
      {manualSetup.configured_keys.length > 0 ? (
        <div className="rounded-[12px] border border-border/60 bg-muted/20 divide-y divide-border/40">
          {manualSetup.configured_keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <KeyRound className="size-3.5 shrink-0 text-foreground/60" />
                <span className="text-xs text-foreground truncate">
                  {[regionOptionLabel(key.region, manualSetup.region_options), "Key"].filter(Boolean).join(" ")}
                </span>
                <span className="text-[10px] text-foreground/50 font-mono truncate">···{key.id.slice(-4)}</span>
              </div>
              <button
                type="button"
                aria-label="Delete key"
                onClick={() => onDeleteKey(providerId, key.id)}
                disabled={deletingKeyId === key.id}
                className="shrink-0 rounded-md p-1 text-foreground/50 hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-[11px] text-foreground/60 hover:text-foreground transition-colors"
        >
          <Plus className="size-3.5" />
          Add API Key
        </button>
      )}

      {showAddForm && (
        <div className="rounded-[12px] border border-border/60 bg-muted/20 p-3">
          <div className="grid gap-2.5">
            {manualSetup.region_options.length > 0 && (
              <div className="grid gap-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/90">
                  Region
                </div>
                <Select value={region} onValueChange={setRegion} disabled={isSaving}>
                  <SelectTrigger className="h-8 w-full rounded-[10px] bg-background/70 text-xs">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {manualSetup.region_options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <UsagePortalLink providerId={providerId} region={selectedRegion} className="mt-1" />
              </div>
            )}

            <div className="grid gap-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/90">
                API Key
              </div>
              <Input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") handleAdd(); }}
                placeholder="Paste API key"
                disabled={isSaving}
                className="h-8 rounded-[10px] bg-background/70 text-xs"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              {manualSetup.configured_keys.length > 0 ? (
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setApiKey(""); }}
                  className="text-[11px] text-foreground/50 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              ) : <div />}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAdd}
                disabled={isSaving || !apiKey.trim()}
                className="h-8 rounded-[10px] px-3 text-xs"
              >
                {isSaving ? "Saving…" : "Add Key"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UsagePortalLink({
  providerId,
  region,
  className,
}: {
  providerId: string;
  region: ProviderRegion | null;
  className?: string;
}) {
  const href = usagePortalUrl(providerId, region);
  if (!href) return null;
  const regionLabel = region ? (region === "china" ? "China" : "Global") : null;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        <span className="truncate">{href}</span>
      </a>
      {regionLabel ? (
        <span className="inline-flex shrink-0 items-center rounded-sm border border-border/70 bg-background/75 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/85">
          {regionLabel}
        </span>
      ) : null}
    </div>
  );
}

export const PROVIDER_ICON_IDS = new Set([
  "claude",
  "codex",
  "commandcode",
  "cursor",
  "opencode",
  "factory",
  "gemini",
  "antigravity",
  "zai",
  "minimax",
  "mimo",
  "kimi",
  "amp",
  "zed",
]);

export function ProviderGlyph({
  providerId,
  size = 26,
  className,
}: {
  providerId: string;
  size?: number;
  className?: string;
}) {
  if (providerId === ALL_PROVIDER_ID) {
    return <Blocks className={cn(`size-[${size}px] stroke-[1.8]`, className)} />;
  }

  if (!PROVIDER_ICON_IDS.has(providerId)) {
    return <Coins className={cn(`size-[${size}px] stroke-[1.8]`, className)} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 select-none bg-current", className)}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(/ai-provider/${providerId}.svg)`,
        maskImage: `url(/ai-provider/${providerId}.svg)`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

export function UsageSwitch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "h-[18px] w-8 border border-border/70 bg-background/80 shadow-none transition-colors",
        "data-[state=checked]:border-foreground/85 data-[state=checked]:bg-foreground",
        "data-[state=unchecked]:bg-background/70",
        "[&_[data-slot=switch-thumb]]:size-[13px] [&_[data-slot=switch-thumb]]:shadow-none",
        "data-[state=checked]:[&_[data-slot=switch-thumb]]:bg-background",
        "data-[state=unchecked]:[&_[data-slot=switch-thumb]]:bg-muted-foreground/65"
      )}
    />
  );
}

export function ProviderSwitch({
  id,
  label,
  selected,
  active,
  draggable,
  onClick,
}: {
  id: string;
  label: string;
  selected: boolean;
  active: boolean;
  draggable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "group relative flex w-[64px] shrink-0 flex-col items-center gap-1.5 rounded-[16px] border border-transparent px-1.5 py-2.5 transition-all duration-200",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        selected
          ? "border-border/75 bg-accent/75 text-foreground shadow-[0_14px_30px_-22px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : active
            ? "text-foreground/85 hover:bg-muted/55"
            : "text-muted-foreground/55 hover:bg-muted/45 hover:text-foreground/90"
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-[14px] border transition-all duration-200",
          selected
            ? "border-border/80 bg-background/92 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : active
              ? "border-border/70 bg-background/80 text-foreground/90"
              : "border-border/45 bg-background/55 text-muted-foreground/55"
        )}
      >
        <ProviderGlyph providerId={id} />
      </div>
      <div
        className={cn(
          "max-w-full truncate text-[10px] font-semibold leading-none",
          selected ? "text-foreground" : active ? "text-foreground/85" : "text-muted-foreground/55"
        )}
      >
        {label}
      </div>
    </button>
  );
}

export function SortableProviderSwitch({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("shrink-0", isDragging && "z-20 opacity-90")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
