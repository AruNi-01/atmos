import { defaultLocale, locales } from "@atmos/i18n/config";

export function currentAppLocale(): string;
export function currentAppLocale(fallback: null): string | null;
export function currentAppLocale(fallback: string): string;
export function currentAppLocale(fallback: string | null = defaultLocale): string | null {
  if (typeof window === "undefined") {
    return fallback;
  }

  const firstPathSegment = window.location.pathname
    .split("/")
    .filter(Boolean)[0];
  if (isLocaleSegment(firstPathSegment)) {
    return firstPathSegment;
  }

  const htmlLang = document.documentElement.lang;
  if (isLocaleSegment(htmlLang)) {
    return htmlLang;
  }

  return fallback;
}

export function isLocaleSegment(value: string | null | undefined): value is string {
  return !!value && locales.includes(value as (typeof locales)[number]);
}
