import { SETTINGS_SECTIONS } from "@/features/settings/components/settings-modal-data";
import type { SettingsModalTab } from "@/shared/lib/nuqs/searchParams";
import {
  peekLastSettingsGroupTab,
  rememberSettingsGroupTab,
} from "@/features/settings/lib/settings-section-group-tabs";

export const DEFAULT_SETTINGS_TAB: SettingsModalTab = SETTINGS_SECTIONS[0].id;

const SETTINGS_TAB_IDS = new Set<string>(SETTINGS_SECTIONS.map((section) => section.id));

let lastSettingsTab: SettingsModalTab | null = null;

export function isSettingsTab(value: string | null | undefined): value is SettingsModalTab {
  return Boolean(value && SETTINGS_TAB_IDS.has(value));
}

export function rememberSettingsTab(tab: SettingsModalTab | null | undefined): void {
  if (!isSettingsTab(tab)) return;
  lastSettingsTab = tab;
}

export function peekLastSettingsTab(): SettingsModalTab | null {
  return lastSettingsTab;
}

export function resolveSettingsTab(tab?: SettingsModalTab | null): SettingsModalTab {
  if (isSettingsTab(tab)) return tab;
  return lastSettingsTab ?? DEFAULT_SETTINGS_TAB;
}

export function settingsHref(tab?: SettingsModalTab | null, hash?: string): string {
  const resolved = resolveSettingsTab(tab);
  if (tab) rememberSettingsTab(tab);
  if (hash) rememberSettingsGroupTab(resolved, hash);
  const href = `/settings?activeSettingTab=${resolved}`;
  const nextHash = hash ?? peekLastSettingsGroupTab(resolved) ?? "";
  return nextHash ? `${href}#${nextHash}` : href;
}

export function __resetLastSettingsTabForTests(): void {
  lastSettingsTab = null;
}
