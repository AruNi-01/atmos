/**
 * Locale helpers for browser session chrome (fallback messages when next-intl not ready).
 */

import { createTranslator } from "next-intl";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type BrowserTranslationValues = Record<string, string | number | boolean | null | undefined>;

let cachedBrowserLocale: "en" | "zh" | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedBrowserTranslator: any = null;

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
    cachedBrowserTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "browser",
    });
  }

  try {
    return cachedBrowserTranslator(key as never, values as never);
  } catch {
    return formatBrowserFallbackMessage(fallback, values);
  }
}
