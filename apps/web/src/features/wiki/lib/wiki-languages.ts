import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import { currentAppLocale } from "@/shared/lib/current-app-locale";

let cachedWikiLanguagesLocale: "en" | "zh" | null = null;
let cachedWikiLanguagesTranslator: any = null;

function wikiLanguagesT(key: "otherCustom") {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedWikiLanguagesTranslator || cachedWikiLanguagesLocale !== locale) {
    cachedWikiLanguagesLocale = locale;
    cachedWikiLanguagesTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "wiki.languages",
    });
  }
  return cachedWikiLanguagesTranslator(key as never);
}

/** Language options with native names (each in its own language) */
export function getWikiLanguageOptions() {
  return [
    { value: "en", label: "English" },
    { value: "zh", label: "中文" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "de", label: "Deutsch" },
    { value: "pt", label: "Português" },
    { value: "ru", label: "Русский" },
    { value: "ar", label: "العربية" },
    { value: "hi", label: "हिन्दी" },
    { value: "other", label: wikiLanguagesT("otherCustom") },
  ] as const;
}
