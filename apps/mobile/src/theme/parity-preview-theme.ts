import type { MobileThemeColorScheme } from "@/theme/colors";

export type ParityPreviewThemeSource = "query" | "disk" | "carousel";

export type ParityPreviewThemeOverride = {
  colorScheme: MobileThemeColorScheme;
  /**
   * Disk-pin cold launches may flip native appearance once. Query-pin
   * (`openurl`) and the in-process carousel must stay JS-only: a mid-session
   * `Appearance.setColorScheme("dark")` crashes Hermes (`localtime_r`).
   */
  nativeAppearance: boolean;
};

let override: ParityPreviewThemeOverride | null = null;
const listeners = new Set<() => void>();

export function getParityPreviewThemeOverride(): ParityPreviewThemeOverride | null {
  return override;
}

export function subscribeParityPreviewTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setParityPreviewThemeOverride(next: ParityPreviewThemeOverride | null): void {
  if (
    override === next ||
    (override != null &&
      next != null &&
      override.colorScheme === next.colorScheme &&
      override.nativeAppearance === next.nativeAppearance)
  ) {
    return;
  }
  override = next;
  for (const listener of listeners) listener();
}

export function resetParityPreviewThemeOverride(): void {
  setParityPreviewThemeOverride(null);
}

export function parityPreviewThemeOverride(
  colorScheme: MobileThemeColorScheme,
  source: ParityPreviewThemeSource,
): ParityPreviewThemeOverride {
  return {
    colorScheme,
    nativeAppearance: source === "disk",
  };
}

export function parityPreviewThemeSource(input: {
  queryPin: boolean;
  diskPin: boolean;
}): ParityPreviewThemeSource {
  if (input.queryPin) return "query";
  if (input.diskPin) return "disk";
  return "carousel";
}

/**
 * `null` means skip `Appearance.setColorScheme`.
 *
 * Persisted Settings preference is JS-only (`useMobileTheme`, CSS variables,
 * `Host colorScheme`, `StatusBar`). Passing it to `Appearance.setColorScheme`
 * mid-session crashes Hermes in `localtime_r`. Query-pin and carousel also
 * return null. Disk-pin (`nativeAppearance`) may still apply once.
 */
export function nativeColorSchemeToApply(
  preview: ParityPreviewThemeOverride | null,
): MobileThemeColorScheme | null {
  if (!preview?.nativeAppearance) return null;
  return preview.colorScheme;
}
