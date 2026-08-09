"use client";

/** Compact install/update progress bar for Desktop Use engine settings. */
export function DesktopUseEngineProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className="h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:w-28"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
