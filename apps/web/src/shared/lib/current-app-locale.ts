import { defaultLocale, locales, type Locale } from "@atmos/i18n/config";

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

  // Prefer global document; fall back to window.document (happy-dom / partial polyfills).
  const doc =
    typeof document !== "undefined"
      ? document
      : (window as Window & { document?: Document }).document;
  const htmlLang = doc?.documentElement?.lang;
  if (isLocaleSegment(htmlLang)) {
    return htmlLang;
  }

  return fallback;
}

export function isLocaleSegment(value: string | null | undefined): value is Locale {
  return !!value && locales.includes(value as Locale);
}
