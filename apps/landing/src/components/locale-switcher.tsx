"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@atmos/i18n/navigation";
import { LanguageSelector } from "@workspace/ui/components/language-selector";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleSelect = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale });
  };

  const items = [
    { label: "English", value: "en" },
    { label: "简体中文", value: "zh" },
  ];

  return <LanguageSelector locale={locale} onSelect={handleSelect} items={items} />;
}
