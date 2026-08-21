import type { SettingsSectionId } from "@/features/settings/components/settings-modal-data";
import { SETTINGS_SEARCH_ITEMS } from "@/features/settings/components/settings-modal-data";

export const SETTINGS_SECTION_GROUP_TABS = {
  general: ["appearance", "about", "experiments"],
  editor: ["editor", "canvas"],
  workspace: ["workspace", "labels"],
  "remote-access": ["atmos-computer", "tunnel-connector"],
  apps: ["integrations", "browser", "desktop-use"],
} as const;

export type SettingsSectionWithGroupTabs = keyof typeof SETTINGS_SECTION_GROUP_TABS;
export type SettingsGroupTabId =
  (typeof SETTINGS_SECTION_GROUP_TABS)[SettingsSectionWithGroupTabs][number];

const GROUP_TAB_IDS = new Set<string>(
  Object.values(SETTINGS_SECTION_GROUP_TABS).flat(),
);

const SEARCH_TOPIC_TO_GROUP_TAB: Record<string, SettingsGroupTabId> = {
  appearance: "appearance",
  about: "about",
  experiments: "experiments",
  editor: "editor",
  canvas: "canvas",
  workspace: "workspace",
  labels: "labels",
  atmosComputer: "atmos-computer",
  tunnelConnector: "tunnel-connector",
  integrations: "integrations",
  browser: "browser",
  desktopUse: "desktop-use",
};

export function getSettingsSectionGroupTabs(
  sectionId: string,
): readonly SettingsGroupTabId[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_SECTION_GROUP_TABS, sectionId)) {
    return undefined;
  }
  return SETTINGS_SECTION_GROUP_TABS[sectionId as SettingsSectionWithGroupTabs];
}

export function isSettingsGroupTabId(value: string): value is SettingsGroupTabId {
  return GROUP_TAB_IDS.has(value);
}

export function settingsGroupTabLabelKey(tabId: string): string {
  return `sections.${toCamelCase(tabId)}.label`;
}

export function settingsGroupTabDescriptionKey(tabId: string): string {
  return `sections.${toCamelCase(tabId)}.description`;
}

export function settingsGroupTabFromTranslationKey(
  translationKey: string | undefined,
): SettingsGroupTabId | null {
  if (!translationKey) return null;
  const topic = translationKey.split(".")[0];
  return SEARCH_TOPIC_TO_GROUP_TAB[topic] ?? null;
}

export function settingsGroupTabForSearchItem(item: {
  sectionId: string;
  translationKey?: string;
}): SettingsGroupTabId | null {
  const tabs = getSettingsSectionGroupTabs(item.sectionId);
  if (!tabs) return null;
  const fromKey = settingsGroupTabFromTranslationKey(item.translationKey);
  if (fromKey && tabs.includes(fromKey)) return fromKey;
  return null;
}

export function resolveSettingsGroupTab(
  sectionId: SettingsSectionId,
  hash: string,
  remembered?: string | null,
): SettingsGroupTabId | null {
  const tabs = getSettingsSectionGroupTabs(sectionId);
  if (!tabs) return null;
  if (tabs.includes(hash as SettingsGroupTabId)) return hash as SettingsGroupTabId;
  if (remembered && tabs.includes(remembered as SettingsGroupTabId)) {
    return remembered as SettingsGroupTabId;
  }
  return tabs[0];
}

export function isForeignSettingsGroupTabHash(sectionId: SettingsSectionId, hash: string): boolean {
  if (!hash || !isSettingsGroupTabId(hash)) return false;
  const tabs = getSettingsSectionGroupTabs(sectionId);
  return !tabs?.includes(hash);
}

export function resolveSettingsGroupTabFromSearch(
  sectionId: SettingsSectionId,
  query: string,
): SettingsGroupTabId | null {
  const tabs = getSettingsSectionGroupTabs(sectionId);
  if (!tabs || !query.trim()) return null;

  const normalizedQuery = normalizeSettingsSearchValue(query);
  if (!normalizedQuery) return null;

  const match = SETTINGS_SEARCH_ITEMS.find((item) => {
    if (item.sectionId !== sectionId || !item.translationKey) return false;
    const haystack = normalizeSettingsSearchValue(
      `${item.label} ${humanizeTranslationKey(item.translationKey)}`,
    );
    return haystack.includes(normalizedQuery);
  });

  if (!match) return null;
  return settingsGroupTabForSearchItem(match);
}

export function readSettingsHash(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}

export function replaceSettingsGroupHash(tabId: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const nextHash = tabId ? `#${tabId}` : "";
  if (url.hash === nextHash) return;
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${nextHash}`);
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (match) => match[1].toUpperCase());
}

function humanizeTranslationKey(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[._-]+/g, " ");
}

function normalizeSettingsSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
