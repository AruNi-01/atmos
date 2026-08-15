'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsSubtle,
  TabsSubtleItem,
} from '@workspace/ui';
import { Laptop, Moon, Sun, SunMoon } from 'lucide-react';
import { useWorkbenchLocale } from '@/providers/app/workbench-intl-provider';
import { SettingsGroupRow } from '@/features/settings/components/settings/SettingsGroupCard';

const THEME_OPTIONS = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Laptop },
] as const;

export function AppearanceSettingsSection() {
  const t = useTranslations('settings.appearanceSection');
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useWorkbenchLocale();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const themeValue = mounted && (theme === 'light' || theme === 'dark' || theme === 'system')
    ? theme
    : 'system';
  const themeIndex = Math.max(0, THEME_OPTIONS.findIndex((option) => option.id === themeValue));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <SunMoon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{t('title')}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('description')}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4">
          <SettingsGroupRow
            wide
            title={t('theme.title')}
            description={t('theme.description')}
          >
            <TabsSubtle
              idPrefix="settings-theme"
              activeLabel
              selectedIndex={themeIndex}
              onSelect={(index) => {
                const next = THEME_OPTIONS[index];
                if (next) setTheme(next.id);
              }}
              className="justify-end"
              aria-label={t('theme.title')}
            >
              {THEME_OPTIONS.map((option, index) => (
                <TabsSubtleItem
                  key={option.id}
                  index={index}
                  label={t(`theme.${option.id}`)}
                  icon={option.icon}
                />
              ))}
            </TabsSubtle>
          </SettingsGroupRow>

          <SettingsGroupRow
            wide
            title={t('language.title')}
            description={t('language.description')}
          >
            <Select
              value={locale}
              onValueChange={(next) => {
                if (next === 'en' || next === 'zh') {
                  setLocale(next);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-[160px]"
                aria-label={t('language.title')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="en">{t('language.en')}</SelectItem>
                <SelectItem value="zh">{t('language.zh')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsGroupRow>
        </div>
      </div>
    </div>
  );
}
