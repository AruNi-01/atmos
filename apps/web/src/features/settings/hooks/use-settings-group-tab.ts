'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsSectionId } from '@/features/settings/components/settings-modal-data';
import {
  getSettingsSectionGroupTabs,
  readSettingsHash,
  replaceSettingsGroupHash,
  resolveSettingsGroupTab,
  resolveSettingsGroupTabFromSearch,
  type SettingsGroupTabId,
} from '@/features/settings/lib/settings-section-group-tabs';

export function useSettingsGroupTab(
  sectionId: SettingsSectionId,
  searchQuery: string,
) {
  const lastTabBySectionRef = useRef<Partial<Record<SettingsSectionId, SettingsGroupTabId>>>({});
  const groupTabs = getSettingsSectionGroupTabs(sectionId);
  const [groupTab, setGroupTab] = useState<SettingsGroupTabId | null>(() =>
    resolveSettingsGroupTab(sectionId, readSettingsHash()),
  );

  useEffect(() => {
    const syncFromLocation = () => {
      const hash = readSettingsHash();
      const next = resolveSettingsGroupTab(
        sectionId,
        hash,
        lastTabBySectionRef.current[sectionId],
      );
      setGroupTab(next);
      if (next) {
        lastTabBySectionRef.current[sectionId] = next;
      }
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
    lastTabBySectionRef.current[sectionId] = fromSearch;
    replaceSettingsGroupHash(fromSearch);
  }, [searchQuery, sectionId]);

  const selectGroupTab = useCallback(
    (value: string) => {
      const tabs = getSettingsSectionGroupTabs(sectionId);
      if (!tabs?.includes(value as SettingsGroupTabId)) return;
      const next = value as SettingsGroupTabId;
      setGroupTab(next);
      lastTabBySectionRef.current[sectionId] = next;
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
