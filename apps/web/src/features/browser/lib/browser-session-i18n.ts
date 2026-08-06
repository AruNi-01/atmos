/**
 * Locale helpers for browser session chrome (fallback messages when next-intl not ready).
 */

import { createTranslator } from "next-intl";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type BrowserTranslationValues = Record<string, string | number | boolean | null | undefined>;
type BrowserTranslator = (
  key: string,
  values?: BrowserTranslationValues,
) => string;

let cachedBrowserLocale: "en" | "zh" | null = null;
let cachedBrowserTranslator: BrowserTranslator | null = null;

function formatBrowserFallbackMessage(
  template: string,
  values?: BrowserTranslationValues,
): string {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

/** Translate a browser.* key with fallback string (preview-era helper renamed). */
export function browserT(
  key: string,
  fallback: string,
  values?: BrowserTranslationValues,
): string {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedBrowserTranslator || cachedBrowserLocale !== locale) {
    cachedBrowserLocale = locale;
    const translator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "browser",
    });
    cachedBrowserTranslator = (k, v) => translator(k as never, v as never);
  }

  try {
    return cachedBrowserTranslator(key, values);
  } catch {
    return formatBrowserFallbackMessage(fallback, values);
  }
}
