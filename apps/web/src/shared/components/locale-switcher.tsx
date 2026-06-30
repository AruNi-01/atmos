"use client";

import { useTranslations } from "next-intl";
import { locales, type Locale } from "@atmos/i18n/config";
import { useWorkbenchLocale } from "@/providers/app/workbench-intl-provider";
import { LanguageSelector } from "@workspace/ui/components/language-selector";

export function LocaleSwitcher() {
  const { locale, setLocale } = useWorkbenchLocale();
  const t = useTranslations("header");

  const handleSelect = (nextLocale: string) => {
    if (locales.includes(nextLocale as Locale)) {
      setLocale(nextLocale as Locale);
    }
  };

  const items = [
    { label: t("localeEnglish"), value: "en" },
    { label: t("localeChinese"), value: "zh" },
  ];

  return <LanguageSelector locale={locale} onSelect={handleSelect} items={items} />;
}
