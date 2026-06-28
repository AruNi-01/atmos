"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@atmos/i18n/navigation";
import { LanguageSelector } from "@workspace/ui/components/language-selector";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("header");

  const handleSelect = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale });
  };

  const items = [
    { label: t("localeEnglish"), value: "en" },
    { label: t("localeChinese"), value: "zh" },
  ];

  return <LanguageSelector locale={locale} onSelect={handleSelect} items={items} />;
}
