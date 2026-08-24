'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SettingsSectionId } from '@/features/settings/components/settings-modal-data';
import {
  getSettingsSectionGroupTabs,
  peekLastSettingsGroupTab,
  readSettingsHash,
  rememberSettingsGroupTab,
  replaceSettingsGroupHash,
  resolveSettingsGroupTab,
  resolveSettingsGroupTabFromSearch,
  type SettingsGroupTabId,
} from '@/features/settings/lib/settings-section-group-tabs';

export function useSettingsGroupTab(
  sectionId: SettingsSectionId,
  searchQuery: string,
) {
  const groupTabs = getSettingsSectionGroupTabs(sectionId);
  const [groupTab, setGroupTab] = useState<SettingsGroupTabId | null>(() =>
    resolveSettingsGroupTab(sectionId, readSettingsHash(), peekLastSettingsGroupTab(sectionId)),
  );

  useEffect(() => {
    const syncFromLocation = () => {
      const hash = readSettingsHash();
      const next = resolveSettingsGroupTab(
        sectionId,
        hash,
        peekLastSettingsGroupTab(sectionId),
      );
      setGroupTab(next);
      if (next) rememberSettingsGroupTab(sectionId, next);
    };

    syncFromLocation();
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, [sectionId]);

  useEffect(() => {
    const fromSearch = resolveSettingsGroupTabFromSearch(sectionId, searchQuery);
    if (!fromSearch) return;
    setGroupTab(fromSearch);
    rememberSettingsGroupTab(sectionId, fromSearch);
    replaceSettingsGroupHash(fromSearch);
  }, [searchQuery, sectionId]);

  const selectGroupTab = useCallback(
    (value: string) => {
      const tabs = getSettingsSectionGroupTabs(sectionId);
      if (!tabs?.includes(value as SettingsGroupTabId)) return;
      const next = value as SettingsGroupTabId;
      setGroupTab(next);
      rememberSettingsGroupTab(sectionId, next);
      replaceSettingsGroupHash(next);
    },
    [sectionId],
  );

  return {
    groupTabs,
    groupTab: groupTab && groupTabs?.includes(groupTab) ? groupTab : groupTabs?.[0] ?? null,
    selectGroupTab,
  };
}
